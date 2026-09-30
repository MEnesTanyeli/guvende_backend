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

  it('charges one token per point and rejects a request atomically', () => {
    limiter.reserve('user-a', 250, 0);
    limiter.reserve('user-a', 250, 0);
    expect(() => limiter.reserve('user-a', 1, 0)).toThrow(
      LocationRateLimitException,
    );
    expect(() => limiter.reserve('user-b', 500, 0)).not.toThrow();
  });

  it('refills 250 points per minute up to a 500 point capacity', () => {
    limiter.reserve('user-a', LOCATION_RATE_LIMIT.capacity, 0);
    expect(() => limiter.reserve('user-a', 250, 59_999)).toThrow(
      LocationRateLimitException,
    );
    expect(() => limiter.reserve('user-a', 250, 60_000)).not.toThrow();
  });

  it('enforces the 1000 point rolling five-minute ceiling', () => {
    limiter.reserve('user-a', 500, 0);
    limiter.reserve('user-a', 250, 60_000);
    limiter.reserve('user-a', 250, 120_000);
    try {
      limiter.reserve('user-a', 1, 180_000);
      throw new Error('Expected rolling ceiling rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(LocationRateLimitException);
      expect((error as LocationRateLimitException).retryAfterSeconds).toBe(120);
    }
    expect(() => limiter.reserve('user-a', 1, 300_000)).not.toThrow();
  });

  it('cannot overspend when concurrent callers reserve synchronously', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, async () => limiter.reserve('user-a', 250, 0)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
