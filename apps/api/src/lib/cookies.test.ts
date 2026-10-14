import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies.js';

const app = express();
app.get('/set', (_req, res) => {
  setAuthCookies(res, 'access-value', 'refresh-value');
  res.end();
});
app.get('/clear', (_req, res) => {
  clearAuthCookies(res);
  res.end();
});

const cookieHeader = (res: request.Response, name: string) =>
  ((res.headers['set-cookie'] ?? []) as unknown as string[]).find((c) => c.startsWith(`${name}=`));

describe('auth cookies', () => {
  it('sets both cookies as httpOnly, SameSite=Lax', async () => {
    const res = await request(app).get('/set');

    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      const cookie = cookieHeader(res, name);
      expect(cookie, name).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    }
  });

  it('lives 15 minutes for access and 7 days for refresh', async () => {
    const res = await request(app).get('/set');

    expect(cookieHeader(res, ACCESS_COOKIE)).toMatch(/Max-Age=900(;|$)/i);
    expect(cookieHeader(res, REFRESH_COOKIE)).toMatch(/Max-Age=604800(;|$)/i);
  });

  it('sends the refresh cookie only to /api/auth', async () => {
    const res = await request(app).get('/set');

    expect(cookieHeader(res, ACCESS_COOKIE)).toMatch(/Path=\/(;|$)/i);
    expect(cookieHeader(res, REFRESH_COOKIE)).toMatch(/Path=\/api\/auth/i);
  });

  it('is not Secure outside production (localhost is plain http)', async () => {
    const res = await request(app).get('/set');
    expect(cookieHeader(res, ACCESS_COOKIE)).not.toMatch(/Secure/i);
  });

  it('clears both cookies with the same paths they were set with', async () => {
    const res = await request(app).get('/clear');

    const access = cookieHeader(res, ACCESS_COOKIE);
    const refresh = cookieHeader(res, REFRESH_COOKIE);
    expect(access).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(access).toMatch(/Path=\/(;|$)/i);
    expect(refresh).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(refresh).toMatch(/Path=\/api\/auth/i);
  });
});
