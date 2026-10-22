import type { UserRole } from '@lumen/shared';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ACCESS_COOKIE } from '../src/lib/cookies.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { assertTestDatabase } from './test-db.js';

export const TEST_PASSWORD = 'Password123!';

let counter = 0;
const next = () => (counter += 1);

/** Empty every table. Refuses to run unless the database name ends in `_test`. */
export async function resetDb(): Promise<void> {
  assertTestDatabase(env.DATABASE_URL);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "enrollments", "lessons", "modules", "courses", "refresh_tokens", "users" ' +
      'RESTART IDENTITY CASCADE',
  );
}

interface UserOverrides {
  email?: string;
  fullName?: string;
  role?: UserRole;
  password?: string;
  deletedAt?: Date | null;
}

/** Insert a user. Returns the row and the plain password (so a test can log in with it). */
export async function createUser(overrides: UserOverrides = {}) {
  const n = next();
  const password = overrides.password ?? TEST_PASSWORD;
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}@lumen.test`,
      fullName: overrides.fullName ?? `Test User ${n}`,
      role: overrides.role ?? 'STUDENT',
      // Cost 4 keeps tests fast. verify() reads the cost from the hash, so it still works.
      passwordHash: await hash(password, 4),
      deletedAt: overrides.deletedAt ?? null,
    },
  });
  return { user, password };
}

interface CourseOverrides {
  title?: string;
  slug?: string;
  summary?: string;
  description?: string | null;
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  deletedAt?: Date | null;
}

export async function createCourse(instructorId: string, overrides: CourseOverrides = {}) {
  const n = next();
  const status = overrides.status ?? 'DRAFT';
  return prisma.course.create({
    data: {
      instructorId,
      title: overrides.title ?? `Test Course ${n}`,
      slug: overrides.slug ?? `test-course-${n}`,
      summary: overrides.summary ?? 'A short summary.',
      description:
        overrides.description === undefined ? 'A longer description.' : overrides.description,
      level: overrides.level ?? 'BEGINNER',
      status,
      publishedAt: status === 'DRAFT' ? null : new Date(),
      deletedAt: overrides.deletedAt ?? null,
    },
  });
}

/** A request with no login. */
export const anonymous = () => request(createApp());

/**
 * A request that is already logged in as `user`: it carries a valid access cookie, like a browser
 * after login. Use it for everything except tests of the login endpoint itself.
 */
export async function agentFor(user: { id: string; role: UserRole }) {
  const token = await signAccessToken({ userId: user.id, role: user.role });
  const agent = request.agent(createApp());
  agent.set('Cookie', `${ACCESS_COOKIE}=${token}`);
  return agent;
}

/** The whole `Set-Cookie` line for `name`, flags included. */
export function readCookie(res: request.Response, name: string): string | undefined {
  const all = (res.headers['set-cookie'] ?? []) as unknown as string[];
  return all.find((cookie) => cookie.startsWith(`${name}=`));
}

/** Just the value, for sending back on a later request. Throws if the cookie is not there. */
export function cookieValue(res: request.Response, name: string): string {
  const cookie = readCookie(res, name);
  if (!cookie) throw new Error(`No ${name} cookie on this response`);
  return decodeURIComponent(cookie.slice(name.length + 1).split(';')[0] ?? '');
}
