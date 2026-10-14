import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertTestDatabase, databaseName, testDatabaseUrl } from './test-db.js';

/**
 * Runs once before the integration tests:
 *   1. creates the `lumen_test` database if it does not exist yet
 *   2. applies every migration to it (`prisma migrate deploy`)
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  assertTestDatabase(url);
  const name = databaseName(url);

  // Connect to the maintenance database to be able to CREATE DATABASE.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });

  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      'Could not connect to Postgres for the integration tests. Is Docker running? ' +
        'Try: docker compose up -d --wait',
      { cause },
    );
  }

  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`); // name was validated above
    }
  } finally {
    await client.end();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
