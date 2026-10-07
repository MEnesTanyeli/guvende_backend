import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHash } from 'crypto';

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 60_000;
const MAX_TRACKED_ACCOUNTS = 10_000;
const CLEANUP_INTERVAL_MS = 10_000;
const ACCOUNT_KEY_PREFIX = 'auth.login.account:';
const RATE_LIMIT_MESSAGE =
  'Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyin.';

interface AccountAttemptState {
  failures: number[];
  reservations: Set<symbol>;
}

export interface LoginAttemptReservation {
  readonly accountKey: string;
  readonly id: symbol;
}

@Injectable()
export class LoginAttemptService implements OnModuleDestroy {
  private readonly accounts = new Map<string, AccountAttemptState>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredFailures(Date.now()),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  reserve(normalizedEmail: string): LoginAttemptReservation {
    const now = Date.now();
    const accountKey = this.createAccountKey(normalizedEmail);
    const existingState = this.accounts.get(accountKey);
    if (existingState) {
      this.pruneAccount(accountKey, existingState, now);
    }

    let state = this.accounts.get(accountKey);
    if (!state) {
      if (this.accounts.size >= MAX_TRACKED_ACCOUNTS) {
        this.cleanupExpiredFailures(now);
        if (this.accounts.size >= MAX_TRACKED_ACCOUNTS) {
          throw this.tooManyRequests();
        }
      }

      state = { failures: [], reservations: new Set() };
      this.accounts.set(accountKey, state);
    }

    if (state.failures.length + state.reservations.size >= FAILURE_LIMIT) {
      throw this.tooManyRequests();
    }

    const reservation = { accountKey, id: Symbol('login-attempt') };
    state.reservations.add(reservation.id);
    return reservation;
  }

  commitFailure(reservation: LoginAttemptReservation): void {
    const state = this.accounts.get(reservation.accountKey);
    if (!state || !state.reservations.delete(reservation.id)) {
      return;
    }

    const now = Date.now();
    state.failures.push(now);
    this.pruneAccount(reservation.accountKey, state, now);
  }

  release(reservation: LoginAttemptReservation): void {
    const state = this.accounts.get(reservation.accountKey);
    if (!state || !state.reservations.delete(reservation.id)) {
      return;
    }

    this.pruneAccount(reservation.accountKey, state, Date.now());
  }

  private createAccountKey(normalizedEmail: string): string {
    const hash = createHash('sha256').update(normalizedEmail).digest('hex');
    return `${ACCOUNT_KEY_PREFIX}${hash}`;
  }

  private cleanupExpiredFailures(now: number): void {
    for (const [accountKey, state] of this.accounts) {
      this.pruneAccount(accountKey, state, now);
    }
  }

  private pruneAccount(
    accountKey: string,
    state: AccountAttemptState,
    now: number,
  ): void {
    const cutoff = now - FAILURE_WINDOW_MS;
    state.failures = state.failures.filter((timestamp) => timestamp > cutoff);

    if (state.failures.length === 0 && state.reservations.size === 0) {
      this.accounts.delete(accountKey);
    }
  }

  private tooManyRequests(): HttpException {
    return new HttpException(RATE_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }
}
