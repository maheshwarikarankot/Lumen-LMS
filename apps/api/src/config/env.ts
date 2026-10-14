import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

// The one .env lives at the repo root, no matter which folder the process starts in.
config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1, 'is required — copy .env.example to .env'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters — generate one with: openssl rand -base64 48'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // The logger is not up yet (it needs the config), so this one goes straight to stderr.
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

export const env = parsed.data;
