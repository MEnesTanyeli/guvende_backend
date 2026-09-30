import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const LOCATION_RATE_LIMIT = {
  capacity: 500,
  refillPerMinute: 250,
  rollingWindowMs: 5 * 60_000,
  rollingCeiling: 1000,
  inactiveTtlMs: 10 * 60_000,
} as const;

type Consumption = { at: number; cost: number };
type UserBudget = {
  tokens: number;
  refilledAt: number;
  lastSeenAt: number;
  consumed: Consumption[];
};

export class LocationRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'LOCATION_RATE_LIMIT_ACTIVE',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Single-instance MVP limiter. Replace its state store before multi-instance deployment. */
@Injectable()
export class LocationRateLimitService {
  private readonly budgets = new Map<string, UserBudget>();
  private lastCleanupAt = 0;

  reserve(userId: string, cost: number, now = Date.now()): void {
    if (!Number.isInteger(cost) || cost < 0) {
      throw new Error('Location point cost must be a non-negative integer.');
    }
    if (cost === 0) return;

    this.cleanup(now);
    const budget = this.getBudget(userId, now);
    this.refill(budget, now);
    budget.consumed = budget.consumed.filter(
      (entry) => entry.at > now - LOCATION_RATE_LIMIT.rollingWindowMs,
    );
    budget.lastSeenAt = now;

    const rollingTotal = budget.consumed.reduce(
      (total, entry) => total + entry.cost,
      0,
    );
    const tokenWaitMs =
      budget.tokens >= cost
        ? 0
        : ((cost - budget.tokens) / LOCATION_RATE_LIMIT.refillPerMinute) *
          60_000;
    const rollingWaitMs = this.rollingWaitMs(
      budget.consumed,
      rollingTotal,
      cost,
      now,
    );

    if (tokenWaitMs > 0 || rollingWaitMs > 0) {
      throw new LocationRateLimitException(
        Math.max(1, Math.ceil(Math.max(tokenWaitMs, rollingWaitMs) / 1000)),
      );
    }

    budget.tokens -= cost;
    budget.consumed.push({ at: now, cost });
  }

  resetForTests(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Location limiter can only be reset in tests.');
    }
    this.budgets.clear();
    this.lastCleanupAt = 0;
  }

  private getBudget(userId: string, now: number): UserBudget {
    let budget = this.budgets.get(userId);
    if (!budget) {
      budget = {
        tokens: LOCATION_RATE_LIMIT.capacity,
        refilledAt: now,
        lastSeenAt: now,
        consumed: [],
      };
      this.budgets.set(userId, budget);
    }
    return budget;
  }

  private refill(budget: UserBudget, now: number): void {
    const elapsedMs = Math.max(0, now - budget.refilledAt);
    budget.tokens = Math.min(
      LOCATION_RATE_LIMIT.capacity,
      budget.tokens +
        (elapsedMs / 60_000) * LOCATION_RATE_LIMIT.refillPerMinute,
    );
    budget.refilledAt = now;
  }

  private rollingWaitMs(
    consumed: Consumption[],
    rollingTotal: number,
    cost: number,
    now: number,
  ): number {
    if (rollingTotal + cost <= LOCATION_RATE_LIMIT.rollingCeiling) return 0;
    let remaining = rollingTotal;
    for (const entry of consumed) {
      remaining -= entry.cost;
      if (remaining + cost <= LOCATION_RATE_LIMIT.rollingCeiling) {
        return Math.max(
          1,
          entry.at + LOCATION_RATE_LIMIT.rollingWindowMs - now,
        );
      }
    }
    return LOCATION_RATE_LIMIT.rollingWindowMs;
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < 60_000) return;
    this.lastCleanupAt = now;
    for (const [userId, budget] of this.budgets) {
      if (now - budget.lastSeenAt > LOCATION_RATE_LIMIT.inactiveTtlMs) {
        this.budgets.delete(userId);
      }
    }
  }
}
