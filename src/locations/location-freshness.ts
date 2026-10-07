// Preserve the existing five-minute live side-effect window.
export const LOCATION_STALE_AFTER_MS = 5 * 60_000;
export const LOCATION_FUTURE_TOLERANCE_MS = 30_000;

export function canonicalLocationTimestamp(
  location: { measuredAt?: string; recordedAt?: string },
  receivedAt: Date,
  allowServerTimeFallback = true,
): Date {
  return new Date(
    location.measuredAt ||
      location.recordedAt ||
      (allowServerTimeFallback ? receivedAt : ''),
  );
}

export function isValidLocationTimestamp(
  recordedAt: Date,
  receivedAt: Date,
): boolean {
  return (
    Number.isFinite(recordedAt.getTime()) &&
    recordedAt.getTime() <= receivedAt.getTime() + LOCATION_FUTURE_TOLERANCE_MS
  );
}

export function isLocationStale(recordedAt: Date, receivedAt: Date): boolean {
  return receivedAt.getTime() - recordedAt.getTime() > LOCATION_STALE_AFTER_MS;
}
