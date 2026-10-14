import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The one .env lives at the repo root, no matter which folder a command runs from.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` runs on install, before anyone has a .env — so no hard failure here.
    // Commands that really connect (migrate, studio) report a clear error if this is empty.
    url: process.env.DATABASE_URL ?? '',
  },
});
