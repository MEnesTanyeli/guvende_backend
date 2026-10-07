import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const LOCATION_RATE_LIMIT = {
  liveCapacity: 30,
  liveRefillPerMinute: 30,
  deferredCapacity: 500,
  deferredRefillPerMinute: 150,
  rollingWindowMs: 5 * 60_000,
  rollingCeiling: 1000,
  inactiveTtlMs: 10 * 60_000,
} as const;

type TokenBucket = {
  tokens: number;
  refilledAt: number;
};

type Consumption = { at: number; cost: number };
type UserBudget = {
  live: TokenBucket;
  deferred: TokenBucket;
  lastSeenAt: number;
  consumed: Consumption[];
};

export class LocationRateLimitException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    code = 'LOCATION_RATE_LIMIT_ACTIVE',
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Process-local limits and per-user mutex for the single-instance MVP. */
@Injectable()
export class LocationRateLimitService {
  private readonly budgets = new Map<string, UserBudget>();
  private readonly userLocks = new Map<string, Promise<void>>();
  private lastCleanupAt = 0;

  async withUserLock<T>(
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.userLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.userLocks.set(userId, tail);
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (this.userLocks.get(userId) === tail) this.userLocks.delete(userId);
    }
  }

  /** Atomically reserves both class buckets and the common rolling window. */
  reserveBatch(
    userId: string,
    liveCount: number,
    deferredCount: number,
    now = Date.now(),
    oversizedLiveRetryAfterSeconds = 300,
  ): void {
    if (liveCount < 0 || deferredCount < 0) {
      throw new Error('Location reservation counts must be non-negative.');
    }
    const total = liveCount + deferredCount;
    if (total === 0) return;

    const budget = this.getBudget(userId, now);
    const live = this.refill(
      budget.live,
      LOCATION_RATE_LIMIT.liveCapacity,
      LOCATION_RATE_LIMIT.liveRefillPerMinute,
      now,
    );
    const deferred = this.refill(
      budget.deferred,
      LOCATION_RATE_LIMIT.deferredCapacity,
      LOCATION_RATE_LIMIT.deferredRefillPerMinute,
      now,
    );
    const rollingCutoff = now - LOCATION_RATE_LIMIT.rollingWindowMs;
    const consumed = budget.consumed.filter(
      (entry) => entry.at > rollingCutoff,
    );
    const rollingTotal = consumed.reduce((sum, entry) => sum + entry.cost, 0);
    const retryAfter: number[] = [];

    if (liveCount > LOCATION_RATE_LIMIT.liveCapacity) {
      retryAfter.push(Math.max(1, oversizedLiveRetryAfterSeconds));
    } else if (live.tokens < liveCount) {
      retryAfter.push(
        this.tokenRetryAfterSeconds(
          live.tokens,
          liveCount,
          LOCATION_RATE_LIMIT.liveRefillPerMinute,
        ),
      );
    }

    if (deferredCount > LOCATION_RATE_LIMIT.deferredCapacity) {
      retryAfter.push(Number.MAX_SAFE_INTEGER);
    } else if (deferred.tokens < deferredCount) {
      retryAfter.push(
        this.tokenRetryAfterSeconds(
          deferred.tokens,
          deferredCount,
          LOCATION_RATE_LIMIT.deferredRefillPerMinute,
        ),
      );
    }

    if (rollingTotal + total > LOCATION_RATE_LIMIT.rollingCeiling) {
      retryAfter.push(this.rollingRetryAfterSeconds(consumed, total, now));
    }

    if (retryAfter.length > 0) {
      throw new LocationRateLimitException(Math.max(...retryAfter));
    }

    // State changes happen only after every applicable gate has passed.
    budget.live = {
      tokens: live.tokens - liveCount,
      refilledAt: live.refilledAt,
    };
    budget.deferred = {
      tokens: deferred.tokens - deferredCount,
      refilledAt: deferred.refilledAt,
    };
    budget.consumed = [...consumed, { at: now, cost: total }];
    budget.lastSeenAt = now;
  }

  private getBudget(userId: string, now: number): UserBudget {
    this.cleanup(now);
    let budget = this.budgets.get(userId);
    if (!budget) {
      budget = {
        live: { tokens: LOCATION_RATE_LIMIT.liveCapacity, refilledAt: now },
        deferred: {
          tokens: LOCATION_RATE_LIMIT.deferredCapacity,
          refilledAt: now,
        },
        lastSeenAt: now,
        consumed: [],
      };
      this.budgets.set(userId, budget);
    }
    budget.lastSeenAt = now;
    budget.consumed = budget.consumed.filter(
      (entry) => entry.at > now - LOCATION_RATE_LIMIT.rollingWindowMs,
    );
    return budget;
  }

  private refill(
    bucket: TokenBucket,
    capacity: number,
    refillPerMinute: number,
    now: number,
  ): TokenBucket {
    const elapsed = Math.max(0, now - bucket.refilledAt);
    const tokens = Math.min(
      capacity,
      bucket.tokens + (elapsed * refillPerMinute) / 60_000,
    );
    return { tokens, refilledAt: now };
  }

  private tokenRetryAfterSeconds(
    available: number,
    requested: number,
    refillPerMinute: number,
  ): number {
    return Math.max(
      1,
      Math.ceil(((requested - available) * 60) / refillPerMinute),
    );
  }

  private rollingRetryAfterSeconds(
    consumed: Consumption[],
    incoming: number,
    now: number,
  ): number {
    let remaining = consumed.reduce((sum, entry) => sum + entry.cost, 0);
    const requiredRelease = Math.max(
      0,
      remaining + incoming - LOCATION_RATE_LIMIT.rollingCeiling,
    );
    let released = 0;
    for (const entry of consumed) {
      released += entry.cost;
      if (released >= requiredRelease) {
        return Math.max(
          1,
          Math.ceil(
            (entry.at + LOCATION_RATE_LIMIT.rollingWindowMs - now) / 1000,
          ),
        );
      }
    }
    remaining = Math.max(0, remaining - released);
    return remaining + incoming <= LOCATION_RATE_LIMIT.rollingCeiling
      ? 1
      : Number.MAX_SAFE_INTEGER;
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < 60_000) return;
    this.lastCleanupAt = now;
    const inactiveBefore = now - LOCATION_RATE_LIMIT.inactiveTtlMs;
    for (const [userId, budget] of this.budgets) {
      if (budget.lastSeenAt <= inactiveBefore) this.budgets.delete(userId);
    }
  }
}
