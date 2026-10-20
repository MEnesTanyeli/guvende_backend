import {
  LOCATION_RATE_LIMIT,
  LocationRateLimitException,
  LocationRateLimitService,
} from './location-rate-limit.service';

describe('LocationRateLimitService', () => {
  let limiter: LocationRateLimitService;

  beforeEach(() => {
    limiter = new LocationRateLimitService();
  });

  it('reserves live and deferred buckets atomically', () => {
    limiter.reserveBatch('user-a', 30, 500, 0);
    expect(() => limiter.reserveBatch('user-a', 1, 0, 0)).toThrow(
      LocationRateLimitException,
    );
    expect(() => limiter.reserveBatch('user-a', 0, 1, 0)).toThrow(
      LocationRateLimitException,
    );
    expect(() => limiter.reserveBatch('user-b', 30, 500, 0)).not.toThrow();
  });

  it('refills the live bucket at 30 points per minute', () => {
    limiter.reserveBatch('user-a', LOCATION_RATE_LIMIT.liveCapacity, 0, 0);
    expect(() =>
      limiter.reserveBatch('user-a', LOCATION_RATE_LIMIT.liveCapacity, 0, 59_999),
    ).toThrow(
      LocationRateLimitException,
    );
    expect(() =>
      limiter.reserveBatch('user-a', LOCATION_RATE_LIMIT.liveCapacity, 0, 60_000),
    ).not.toThrow();
  });

  it('enforces the 1000 point rolling five-minute ceiling', () => {
    limiter.reserveBatch('user-a', 0, 500, 0);
    limiter.reserveBatch('user-a', 0, 150, 60_000);
    limiter.reserveBatch('user-a', 0, 150, 120_000);
    limiter.reserveBatch('user-a', 0, 150, 180_000);
    limiter.reserveBatch('user-a', 0, 50, 240_000);
    try {
      limiter.reserveBatch('user-a', 0, 1, 240_000);
      throw new Error('Expected rolling ceiling rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(LocationRateLimitException);
      expect((error as LocationRateLimitException).retryAfterSeconds).toBe(60);
    }
    expect(() => limiter.reserveBatch('user-a', 0, 1, 300_000)).not.toThrow();
  });

  it('cannot overspend the live bucket when reservations are concurrent', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, async () =>
        limiter.reserveBatch('user-a', 30, 0, 0),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2);
  });
});
