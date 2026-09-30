// Preserve the existing five-minute live side-effect window.
export const LOCATION_STALE_AFTER_MS = 5 * 60_000;

export function isLocationStale(recordedAt: Date, receivedAt: Date): boolean {
  return receivedAt.getTime() - recordedAt.getTime() > LOCATION_STALE_AFTER_MS;
}
