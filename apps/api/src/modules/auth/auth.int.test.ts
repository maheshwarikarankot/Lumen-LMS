import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  cookieValue,
  createUser,
  readCookie,
  resetDb,
} from '../../../test/helpers.js';
import { createApp } from '../../app.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../lib/cookies.js';
import { prisma } from '../../lib/prisma.js';
import { newRefreshToken, signAccessToken } from '../../lib/tokens.js';
import { loginLimit } from './auth.routes.js';

const app = () => createApp();

const REGISTRATION = {
  fullName: 'Priya Raman',
  email: 'priya@lumen.test',
  password: 'Password123',
  role: 'INSTRUCTOR',
} as const;

const register = (body: Record<string, unknown> = REGISTRATION) =>
  request(app()).post('/api/auth/register').send(body);

const logIn = (email: string, password: string) =>
  request(app()).post('/api/auth/login').send({ email, password });

const refreshWith = (token: string) =>
  request(app()).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${token}`);

beforeEach(async () => {
  await resetDb();
  loginLimit.reset();
});
afterAll(() => prisma.$disconnect());

// ---------------------------------------------------------------- story 1.1

describe('POST /api/auth/register', () => {
  it('creates the account and logs the person straight in', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: 'priya@lumen.test',
      fullName: 'Priya Raman',
      role: 'INSTRUCTOR',
      avatarUrl: null,
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(readCookie(res, ACCESS_COOKIE)).toMatch(/HttpOnly/i);
    expect(readCookie(res, REFRESH_COOKIE)).toMatch(/HttpOnly/i);
  });

  it('never sends the password hash back', async () => {
    const res = await register();

    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('deletedAt');
    expect(JSON.stringify(res.body)).not.toContain(REGISTRATION.password);
  });

  it('stores the password hashed with bcrypt at cost 12', async () => {
    await register();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'priya@lumen.test' } });

    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain(REGISTRATION.password);
  });

  it('records a refresh token as a hash, not as the token', async () => {
    const res = await register();
    const token = cookieValue(res, REFRESH_COOKIE);

    const stored = await prisma.refreshToken.findFirstOrThrow();

    expect(stored.tokenHash).not.toBe(token);
    expect(stored.revokedAt).toBeNull();
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('stores the email lowercased and the name trimmed', async () => {
    const res = await register({
      ...REGISTRATION,
      email: ' Priya@Lumen.TEST ',
      fullName: ' Priya Raman ',
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('priya@lumen.test');
    expect(res.body.fullName).toBe('Priya Raman');
  });

  it('refuses a second account on the same email', async () => {
    await register();

    const res = await register();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('An account with this email already exists');
  });

  it('treats PRIYA@LUMEN.TEST as the same email', async () => {
    await register();

    const res = await register({ ...REGISTRATION, email: 'PRIYA@LUMEN.TEST' });

    expect(res.status).toBe(409);
  });

  it('will not create an admin', async () => {
    const res = await register({ ...REGISTRATION, role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('role');
    expect(await prisma.user.count()).toBe(0);
  });

  it('names every bad field at once', async () => {
    const res = await register({ ...REGISTRATION, email: 'nope', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rejects an unexpected field rather than quietly dropping it', async () => {
    const res = await register({ ...REGISTRATION, id: '11111111-1111-4111-8111-111111111111' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toBe('Unexpected field "id"');
  });
});

// ---------------------------------------------------------------- story 1.2

describe('POST /api/auth/login', () => {
  it('returns the user and sets both cookies', async () => {
    const { user } = await createUser({ email: 'sam@lumen.test' });

    const res = await logIn('sam@lumen.test', TEST_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(readCookie(res, ACCESS_COOKIE)).toMatch(/HttpOnly/i);
    expect(readCookie(res, REFRESH_COOKIE)).toMatch(/HttpOnly/i);
  });

  it('accepts the email in any case', async () => {
    await createUser({ email: 'sam@lumen.test' });

    expect((await logIn(' SAM@Lumen.test ', TEST_PASSWORD)).status).toBe(200);
  });

  it('says the same thing for a wrong password and an unknown email', async () => {
    await createUser({ email: 'sam@lumen.test' });

    const wrongPassword = await logIn('sam@lumen.test', 'Wrong-password-1');
    const noSuchUser = await logIn('nobody@lumen.test', TEST_PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(noSuchUser.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body.error.message).toBe('Incorrect email or password');
  });

  it('turns away a soft-deleted account with that same message', async () => {
    await createUser({ email: 'gone@lumen.test', deletedAt: new Date() });

    const res = await logIn('gone@lumen.test', TEST_PASSWORD);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
  });

  it('puts only userId, role and exp in the access token', async () => {
    const { user } = await createUser({ email: 'sam@lumen.test', role: 'STUDENT' });

    const res = await logIn('sam@lumen.test', TEST_PASSWORD);

    const claims = decodeJwt(cookieValue(res, ACCESS_COOKIE));
    expect(Object.keys(claims).sort()).toEqual(['exp', 'role', 'userId']);
    expect(claims).toMatchObject({ userId: user.id, role: 'STUDENT' });
  });

  it('blocks the sixth failed attempt on one email', async () => {
    await createUser({ email: 'sam@lumen.test' });

    for (let i = 1; i <= 5; i += 1) {
      expect((await logIn('sam@lumen.test', 'Wrong-password-1')).status, `attempt ${i}`).toBe(401);
    }

    const sixth = await logIn('sam@lumen.test', 'Wrong-password-1');
    expect(sixth.status).toBe(429);

    // Even the right password is refused while the block holds.
    expect((await logIn('sam@lumen.test', TEST_PASSWORD)).status).toBe(429);
  });

  it('forgets the failures after a successful login', async () => {
    await createUser({ email: 'sam@lumen.test' });
    for (let i = 0; i < 4; i += 1) await logIn('sam@lumen.test', 'Wrong-password-1');

    expect((await logIn('sam@lumen.test', TEST_PASSWORD)).status).toBe(200);

    for (let i = 0; i < 5; i += 1) {
      expect((await logIn('sam@lumen.test', 'Wrong-password-1')).status).toBe(401);
    }
  });
});

// ---------------------------------------------------------------- story 1.3

describe('POST /api/auth/refresh', () => {
  async function session() {
    const res = await register();
    return { refreshToken: cookieValue(res, REFRESH_COOKIE), userId: res.body.id as string };
  }

  it('hands out a new pair and retires the old refresh token', async () => {
    const { refreshToken } = await session();

    const res = await refreshWith(refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('priya@lumen.test');
    expect(cookieValue(res, REFRESH_COOKIE)).not.toBe(refreshToken);
    expect(cookieValue(res, ACCESS_COOKIE)).toBeTruthy();

    expect((await refreshWith(refreshToken)).status).toBe(401);
  });

  it('leaves exactly one live token behind', async () => {
    const { refreshToken } = await session();

    await refreshWith(refreshToken);

    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
    expect(await prisma.refreshToken.count()).toBe(2);
  });

  it('refuses when there is no cookie at all', async () => {
    const res = await request(app()).post('/api/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses an unknown token', async () => {
    expect((await refreshWith('a-token-nobody-ever-issued')).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    const { user } = await createUser();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const expired = newRefreshToken(eightDaysAgo);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: expired.tokenHash, expiresAt: expired.expiresAt },
    });

    expect((await refreshWith(expired.token)).status).toBe(401);
  });

  it('ends every session when an already-used token comes back', async () => {
    const { refreshToken } = await session();
    const second = cookieValue(await refreshWith(refreshToken), REFRESH_COOKIE);

    // The old one turning up again means it was copied. Trust none of them.
    const replay = await refreshWith(refreshToken);

    expect(replay.status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    expect((await refreshWith(second)).status).toBe(401);
  });

  it('clears the cookies when it refuses', async () => {
    const res = await refreshWith('a-token-nobody-ever-issued');

    expect(readCookie(res, REFRESH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });

  it('refuses once the account is soft-deleted', async () => {
    const { refreshToken, userId } = await session();
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });

    expect((await refreshWith(refreshToken)).status).toBe(401);
  });

  it('lets exactly one of two simultaneous refreshes win', async () => {
    const { refreshToken } = await session();

    const [a, b] = await Promise.all([refreshWith(refreshToken), refreshWith(refreshToken)]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('signs the new token with the role the database holds now', async () => {
    const { refreshToken, userId } = await session();
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });

    const res = await refreshWith(refreshToken);

    expect(decodeJwt(cookieValue(res, ACCESS_COOKIE)).role).toBe('ADMIN');
    expect(res.body.role).toBe('ADMIN');
  });
});

describe('GET /api/auth/me', () => {
  const me = () => request(app()).get('/api/auth/me');

  it('returns the current user from a cookie', async () => {
    const registered = await register();
    const access = cookieValue(registered, ACCESS_COOKIE);

    const res = await me().set('Cookie', `${ACCESS_COOKIE}=${access}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'priya@lumen.test', role: 'INSTRUCTOR' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('also accepts a bearer token, which is how the demo proves it from a terminal', async () => {
    const { user } = await createUser({ role: 'ADMIN' });
    const token = await signAccessToken({ userId: user.id, role: 'ADMIN' });

    const res = await me().set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
  });

  it('refuses with no token, a nonsense token, or a forged one', async () => {
    expect((await me()).status).toBe(401);
    expect((await me().set('Authorization', 'Bearer not-a-token')).status).toBe(401);
    expect((await me().set('Cookie', `${ACCESS_COOKIE}=still.not.a.token`)).status).toBe(401);
  });

  it('refuses a valid token whose account has since been deleted', async () => {
    const { user } = await createUser();
    const token = await signAccessToken({ userId: user.id, role: user.role });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    expect((await me().set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('reports the role from the database, not the one baked into the token', async () => {
    const { user } = await createUser({ role: 'ADMIN' });
    const staleToken = await signAccessToken({ userId: user.id, role: 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { role: 'STUDENT' } });

    const res = await me().set('Authorization', `Bearer ${staleToken}`);

    expect(res.body.role).toBe('STUDENT');
  });

  it('is never cached', async () => {
    const { user } = await createUser();
    const token = await signAccessToken({ userId: user.id, role: user.role });

    const res = await me().set('Authorization', `Bearer ${token}`);

    expect(res.headers['cache-control']).toBe('no-store');
  });
});
