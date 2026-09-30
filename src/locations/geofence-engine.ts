export type ZoneStatus = 'unknown' | 'inside' | 'outside';

export interface GeofenceMemory {
  status: string;
  candidate: string | null;
  candidateCount: number;
  candidateSince: Date | null;
  lastObservedAt: Date | null;
  lastReliableAt: Date | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastAccuracy: number | null;
}

export interface GeofencePoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: Date;
}

export const emptyGeofenceMemory = (): GeofenceMemory => ({
  status: 'unknown',
  candidate: null,
  candidateCount: 0,
  candidateSince: null,
  lastObservedAt: null,
  lastReliableAt: null,
  lastLatitude: null,
  lastLongitude: null,
  lastAccuracy: null,
});

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = Math.PI / 180;
  const x =
    Math.sin(((b.latitude - a.latitude) * radians) / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(((b.longitude - a.longitude) * radians) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

/** Hysteresis and evidence run, independent of upload time and batch boundaries. */
export function advanceGeofence(
  previous: GeofenceMemory,
  point: GeofencePoint,
  zone: { latitude: number; longitude: number; radius: number },
): {
  memory: GeofenceMemory;
  event: 'enter' | 'exit' | null;
  ignored: boolean;
} {
  const time = point.recordedAt.getTime();
  if (
    !Number.isFinite(time) ||
    (previous.lastObservedAt && time <= previous.lastObservedAt.getTime())
  ) {
    return { memory: previous, event: null, ignored: true };
  }
  const memory = { ...previous, lastObservedAt: point.recordedAt };
  const reset = () => {
    memory.candidate = null;
    memory.candidateCount = 0;
    memory.candidateSince = null;
  };
  if (
    previous.lastObservedAt &&
    time - previous.lastObservedAt.getTime() > 120_000
  )
    reset();

  // Unknown/poor accuracy cannot provide evidence of a boundary crossing.
  const accuracy = point.accuracy;
  if (
    accuracy === null ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > 50 ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude)
  ) {
    reset();
    return { memory, event: null, ignored: false };
  }
  // Reject teleport-like fixes without moving the last reliable reference.
  if (
    previous.lastReliableAt &&
    previous.lastLatitude !== null &&
    previous.lastLongitude !== null
  ) {
    const seconds = (time - previous.lastReliableAt.getTime()) / 1000;
    const travel = distanceMeters(
      { latitude: previous.lastLatitude, longitude: previous.lastLongitude },
      point,
    );
    const minimumTravel = Math.max(
      0,
      travel - accuracy - (previous.lastAccuracy ?? 0),
    );
    if (seconds > 0 && minimumTravel / seconds > 50) {
      reset();
      return { memory, event: null, ignored: false };
    }
  }
  memory.lastReliableAt = point.recordedAt;
  memory.lastLatitude = point.latitude;
  memory.lastLongitude = point.longitude;
  memory.lastAccuracy = accuracy;

  const distance = distanceMeters(zone, point);
  const exitRadius = zone.radius + Math.max(10, zone.radius * 0.2);
  const observation: ZoneStatus =
    distance + accuracy <= zone.radius
      ? 'inside'
      : distance - accuracy > exitRadius
        ? 'outside'
        : 'unknown';
  // An uncertain boundary fix breaks the consecutive run, not the confirmed state.
  if (observation === 'unknown' || observation === memory.status) {
    reset();
    return { memory, event: null, ignored: false };
  }
  if (memory.candidate !== observation) {
    memory.candidate = observation;
    memory.candidateCount = 0;
    memory.candidateSince = point.recordedAt;
  }
  memory.candidateCount++;
  // Three distinct fixes spanning >=10s; rapid repeated fixes alone are not evidence.
  if (
    memory.candidateCount < 3 ||
    time - memory.candidateSince!.getTime() < 10_000
  ) {
    return { memory, event: null, ignored: false };
  }
  const oldStatus = memory.status;
  memory.status = observation;
  reset();
  return {
    memory,
    ignored: false,
    event:
      observation === 'inside'
        ? 'enter'
        : oldStatus === 'inside'
          ? 'exit'
          : null,
  };
}
