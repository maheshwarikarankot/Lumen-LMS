import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Same root .env as the app, so `pnpm test` works without extra setup.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

/**
 * The database integration tests run against. Defaults to your dev DATABASE_URL with the
 * database name swapped for `lumen_test`, so tests can never touch your dev data.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env['TEST_DATABASE_URL'];
  if (explicit) return explicit;

  const base = process.env['DATABASE_URL'];
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env (or set TEST_DATABASE_URL).',
    );
  }
  const url = new URL(base);
  url.pathname = '/lumen_test';
  return url.toString();
}

export function databaseName(connectionString: string): string {
  return new URL(connectionString).pathname.slice(1);
}

/** Safety net: anything that deletes data checks this first. */
export function assertTestDatabase(connectionString: string): void {
  const name = databaseName(connectionString);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Refusing to continue: "${name}" is not a test database. Its name must end in _test.`,
    );
  }
}
