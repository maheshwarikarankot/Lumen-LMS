import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS } from './tokens.js';

export const ACCESS_COOKIE = 'lumen_access';
export const REFRESH_COOKIE = 'lumen_refresh';

// The refresh token is only ever needed by the auth endpoints, so the browser only sends it there.
const ACCESS_PATH = '/';
const REFRESH_PATH = '/api/auth';

// httpOnly: JavaScript on the page cannot read these. sameSite lax: not sent on cross-site POSTs.
// secure: HTTPS only — on in production, off locally because localhost is plain http.
const base = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
});

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base(),
    path: ACCESS_PATH,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/** A cookie is only removed if the path (and flags) match the ones it was set with. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}
