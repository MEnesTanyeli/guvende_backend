import {
  activateTestDatabase,
  validateTestDatabaseEnvironment,
} from './test-database-safety';

const safeUrl =
  'postgresql://guvende_test_user:local-only@127.0.0.1:5434/guvende_test?schema=public';

describe('Test database fail-safe', () => {
  it('rejects a non-test environment', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        NODE_ENV: 'development',
        TEST_DATABASE_URL: safeUrl,
      }),
    ).toThrow('NODE_ENV');
  });

  it('rejects a missing TEST_DATABASE_URL without falling back to DATABASE_URL', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: safeUrl,
      }),
    ).toThrow('TEST_DATABASE_URL');
  });

  it('rejects a database and schema without an explicit test marker', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        NODE_ENV: 'test',
        TEST_DATABASE_URL:
          'postgresql://user:password@127.0.0.1:5432/guvende_staging?schema=public',
      }),
    ).toThrow('test bulunmalidir');
  });

  it.each([
    'postgresql://user:password@db.production.internal:5432/guvende_test',
    'postgresql://user:password@127.0.0.1:5432/guvende',
    'postgresql://user:password@127.0.0.1:5432/guvende_prod_test',
  ])('rejects a production-like target without connecting: %s', (url) => {
    expect(() =>
      validateTestDatabaseEnvironment({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: url,
      }),
    ).toThrow('production/development');
  });

  it('honors explicit production host and database deny lists', () => {
    expect(() =>
      validateTestDatabaseEnvironment({
        NODE_ENV: 'test',
        TEST_DATABASE_URL:
          'postgresql://user:password@db.example:5432/application_test',
        PRODUCTION_DATABASE_HOSTS: 'db.example',
      }),
    ).toThrow('production/development');
  });

  it('accepts a dedicated PostgreSQL test database', () => {
    expect(
      validateTestDatabaseEnvironment({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: safeUrl,
      }),
    ).toBe(safeUrl);
  });

  it('assigns DATABASE_URL only after successful validation', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'must-not-be-used',
      TEST_DATABASE_URL: safeUrl,
    };
    activateTestDatabase(env);
    expect(env.DATABASE_URL).toBe(safeUrl);
  });
});
