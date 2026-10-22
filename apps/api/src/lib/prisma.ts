import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// The API is the only thing in the project that talks to the database.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/**
 * True when a write was rejected because a unique index already held that value (Prisma P2002).
 *
 * Catching this beats asking "does it exist?" first: between the question and the insert, a
 * second request can slip in. Only the database can settle that race.
 */
export function isUniqueViolation(error: unknown, column: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== 'P2002') return false;

  const target = meta?.target;
  if (Array.isArray(target)) return target.includes(column);
  if (typeof target === 'string') return target.includes(column);
  return true; // no detail from the driver: treat any unique clash as this one
}
