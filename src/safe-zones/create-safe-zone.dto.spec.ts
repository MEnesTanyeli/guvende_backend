import { validate } from 'class-validator';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';

async function errors(data: Partial<CreateSafeZoneDto>) {
  return validate(Object.assign(new CreateSafeZoneDto(), data));
}

describe('CreateSafeZoneDto validation', () => {
  it.each([
    [-90, -180, 10, 'a'],
    [90, 180, 10000, 'x'.repeat(100)],
  ])('accepts boundary values', async (latitude, longitude, radius, name) => {
    expect(await errors({ latitude, longitude, radius, name })).toHaveLength(0);
  });

  it.each([
    { latitude: 90.0001, longitude: 0, radius: 10, name: 'zone' },
    { latitude: -90.0001, longitude: 0, radius: 10, name: 'zone' },
    { latitude: 0, longitude: 180.0001, radius: 10, name: 'zone' },
    { latitude: 0, longitude: -180.0001, radius: 10, name: 'zone' },
    { latitude: 0, longitude: 0, radius: 9.999, name: 'zone' },
    { latitude: 0, longitude: 0, radius: 10000.001, name: 'zone' },
    { latitude: 0, longitude: 0, radius: 10, name: 'x'.repeat(101) },
    { latitude: Number.NaN, longitude: 0, radius: 10, name: 'zone' },
    { latitude: 0, longitude: Number.POSITIVE_INFINITY, radius: 10, name: 'zone' },
    { latitude: 0, longitude: 0, radius: Number.NEGATIVE_INFINITY, name: 'zone' },
    { latitude: '1' as unknown as number, longitude: 0, radius: 10, name: 'zone' },
  ])('rejects invalid input %#', async (data) => {
    expect((await errors(data)).length).toBeGreaterThan(0);
  });
});
