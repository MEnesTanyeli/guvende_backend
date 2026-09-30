import { spawnSync } from 'node:child_process';
import { activateTestDatabase } from '../src/testing/test-database-safety';

activateTestDatabase();
process.env.BREVO_API_KEY = '';
process.env.ONESIGNAL_APP_ID = '';
process.env.ONESIGNAL_REST_API_KEY = '';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-only-jwt-secret-at-least-32-characters';
process.env.OFFLINE_SOS_MASTER_KEY =
  process.env.OFFLINE_SOS_MASTER_KEY ||
  Buffer.alloc(32, 7).toString('base64url');

function run(modulePath: string, args: string[]): void {
  const result = spawnSync(process.execPath, [require.resolve(modulePath), ...args], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The URL was validated before Prisma receives it.
run('prisma/build/index.js', ['migrate', 'deploy']);
run('jest/bin/jest', ['--config', './test/jest-e2e.json', '--runInBand']);
