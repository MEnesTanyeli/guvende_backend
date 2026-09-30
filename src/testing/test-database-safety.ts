export type TestEnvironment = Record<string, string | undefined>;

const RESERVED_DATABASE_NAMES = new Set([
  'guvende',
  'guvende_dev',
  'guvende_prod',
  'postgres',
]);

function configuredValues(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validate without opening a socket. Error messages deliberately never include
 * the URL, username or password.
 */
export function validateTestDatabaseEnvironment(env: TestEnvironment): string {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Test database reddedildi: NODE_ENV tam olarak test olmalidir.');
  }

  const rawUrl = env.TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error('Test database reddedildi: TEST_DATABASE_URL zorunludur.');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Test database reddedildi: URL gecersizdir.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Test database reddedildi: yalniz PostgreSQL kullanilabilir.');
  }

  const host = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    .trim()
    .toLowerCase();
  const schema = (url.searchParams.get('schema') || '').trim().toLowerCase();
  if (!host || !database) {
    throw new Error('Test database reddedildi: host ve database adi zorunludur.');
  }

  const productionHosts = configuredValues(env.PRODUCTION_DATABASE_HOSTS);
  const productionDatabases = configuredValues(env.PRODUCTION_DATABASE_NAMES);
  if (
    productionHosts.includes(host) ||
    productionDatabases.includes(database) ||
    RESERVED_DATABASE_NAMES.has(database) ||
    /(^|[._-])(prod|production)([._-]|$)/i.test(host) ||
    /(^|[._-])(prod|production)([._-]|$)/i.test(database)
  ) {
    throw new Error('Test database reddedildi: production/development hedefi algilandi.');
  }

  if (!database.includes('test') && !schema.includes('test')) {
    throw new Error(
      'Test database reddedildi: database veya schema adinda test bulunmalidir.',
    );
  }

  return rawUrl;
}

/** Assign Prisma's URL only after all fail-safe checks have passed. */
export function activateTestDatabase(env: NodeJS.ProcessEnv = process.env): string {
  const testUrl = validateTestDatabaseEnvironment(env);
  env.DATABASE_URL = testUrl;
  return testUrl;
}
