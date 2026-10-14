import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/test-db.js';

const secrets = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-0123456789',
};

// Unit-only runs must work without a .env or Docker, so a missing URL is reported by the
// integration project's global setup (with a helpful message) rather than crashing the config.
function integrationDatabaseUrl(): string {
  try {
    return testDatabaseUrl();
  } catch {
    return '';
  }
}

export default defineConfig({
  test: {
    // The integration tests share one database, so test files run one after another.
    // (This option is only allowed at the top level, so unit tests are serial too. They are quick.)
    fileParallelism: false,
    projects: [
      {
        // Fast tests. No database, no Docker: Prisma is replaced by a stub where needed.
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
          env: { ...secrets, DATABASE_URL: 'postgresql://test:test@localhost:5432/test' },
        },
      },
      {
        // Real Postgres (the `lumen_test` database in your Docker container).
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.int.test.ts', 'test/**/*.int.test.ts'],
          globalSetup: ['./test/global-setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 60_000,
          env: { ...secrets, DATABASE_URL: integrationDatabaseUrl() },
        },
      },
    ],
  },
});
