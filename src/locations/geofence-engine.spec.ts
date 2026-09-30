import {
  advanceGeofence,
  emptyGeofenceMemory,
  GeofenceMemory,
  GeofencePoint,
} from './geofence-engine';

const zone = { latitude: 0, longitude: 0, radius: 50 };
const point = (
  meters: number,
  seconds: number,
  accuracy: number | null = 5,
): GeofencePoint => ({
  latitude: ((meters / 6371000) * 180) / Math.PI,
  longitude: 0,
  accuracy,
  recordedAt: new Date(Date.UTC(2026, 8, 17) + seconds * 1000),
});
const inside = (): GeofenceMemory => ({
  ...emptyGeofenceMemory(),
  status: 'inside',
});
const walk = (points: GeofencePoint[], initial = inside()) => {
  let memory = initial;
  const events: string[] = [];
  for (const fix of points) {
    const result = advanceGeofence(memory, fix, zone);
    memory = result.memory;
    if (result.event) events.push(result.event);
  }
  return { memory, events };
};

describe('Geofence evidence and hysteresis', () => {
  it.each([
    [40, 75, 40],
    [40, 75, 80, 40],
    [40, 52, 48, 57, 45, 61, 40],
  ])('does not exit for short GPS jitter (%j)', (...meters) => {
    const result = walk(meters.map((m, i) => point(m, i * 5)));
    expect(result.events).toEqual([]);
    expect(result.memory.status).toBe('inside');
  });
  it('confirms a real exit after the tolerance band, exactly once', () => {
    const result = walk(
      [40, 55, 70, 80, 90, 100, 110].map((m, i) => point(m, i * 5)),
    );
    expect(result.events).toEqual(['exit']);
    expect(result.memory.status).toBe('outside');
  });
  it('keeps the visible inside state until the third outside fix', () => {
    const two = walk([point(75, 0), point(80, 5)]);
    expect(two.memory.status).toBe('inside');
    expect(advanceGeofence(two.memory, point(85, 10), zone).event).toBe('exit');
  });
  it('requires the reported accuracy circle to clear the exit boundary', () => {
    expect(walk([0, 5, 10].map((t) => point(75, t, 20))).events).toEqual([]);
    expect(walk([0, 5, 10].map((t) => point(85, t, 20))).events).toEqual([
      'exit',
    ]);
  });
  it.each([null, 80, NaN, -1])(
    'breaks the evidence run on unusable accuracy %s',
    (accuracy) => {
      const result = walk([
        point(75, 0),
        point(80, 5),
        point(90, 10, accuracy),
        point(95, 15),
      ]);
      expect(result.events).toEqual([]);
      expect(result.memory.candidateCount).toBe(1);
    },
  );
  it('breaks the run on an ambiguous point while preserving the confirmed state', () => {
    const result = walk([
      point(75, 0),
      point(80, 5),
      point(55, 10),
      point(90, 15),
      point(95, 20),
    ]);
    expect(result.events).toEqual([]);
    expect(result.memory.status).toBe('inside');
    expect(result.memory.candidateCount).toBe(2);
  });
  it('requires 10 seconds of evidence even if three fixes arrive rapidly', () => {
    const result = walk([point(75, 0), point(75, 1), point(75, 2)]);
    expect(result.events).toEqual([]);
    expect(advanceGeofence(result.memory, point(75, 10), zone).event).toBe(
      'exit',
    );
  });
  it('does not count equal timestamps or rewind state for older measurements', () => {
    const result = walk([
      point(75, 10),
      point(80, 15),
      point(90, 15),
      point(20, 1),
    ]);
    expect(result.events).toEqual([]);
    expect(result.memory.candidateCount).toBe(2);
    expect(advanceGeofence(result.memory, point(90, 20), zone).event).toBe(
      'exit',
    );
  });
  it('requires a fresh run after a two-minute measurement gap', () => {
    const result = walk([point(75, 0), point(80, 5), point(90, 130)]);
    expect(result.events).toEqual([]);
    expect(result.memory.candidateCount).toBe(1);
  });
  it('rejects a teleport and does not use it as the reliable reference', () => {
    const result = walk([
      point(30, 0),
      point(2000, 5),
      point(2200, 10),
      point(2400, 15),
      point(30, 20),
    ]);
    expect(result.events).toEqual([]);
    expect(result.memory.status).toBe('inside');
  });
  it('confirms re-entry with three reliable inside points and allows the next exit', () => {
    const result = walk(
      [75, 80, 85, 30, 30, 30, 75, 80, 85].map((m, i) => point(m, i * 5)),
    );
    expect(result.events).toEqual(['exit', 'enter', 'exit']);
  });
  it('does not invent an exit when tracking starts outside', () => {
    const result = walk(
      [point(75, 0), point(80, 5), point(85, 10)],
      emptyGeofenceMemory(),
    );
    expect(result.events).toEqual([]);
    expect(result.memory.status).toBe('outside');
  });
  it('confirms initial presence inside before announcing entry', () => {
    expect(
      walk([point(30, 0), point(30, 5)], emptyGeofenceMemory()).events,
    ).toEqual([]);
    expect(
      walk([point(30, 0), point(30, 5), point(30, 10)], emptyGeofenceMemory())
        .events,
    ).toEqual(['enter']);
  });
  it('handles a valid turn without requiring motion away from the center', () => {
    const fixes = [
      point(80, 0),
      { ...point(80, 5), latitude: 0, longitude: point(80, 5).latitude },
      point(-80, 10),
    ];
    expect(walk(fixes).events).toEqual(['exit']);
  });
});
