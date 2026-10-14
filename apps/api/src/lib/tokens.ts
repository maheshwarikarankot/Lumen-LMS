import { createHash, randomBytes } from 'node:crypto';
import { type UserRole, isUserRole } from '@lumen/shared';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/**
 * What an access token says about its owner. Nothing sensitive, and `role` is only a hint for
 * the UI: permission decisions re-read the role from the database (see authenticate middleware).
 */
export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

export async function signAccessToken(
  { userId, role }: AccessTokenPayload,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secret);
}

/** Returns the payload, or null for anything wrong: bad signature, expired, malformed, odd claims. */
export async function verifyAccessToken(
  token: string,
  now: Date = new Date(),
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'], // refuse "alg: none" and anything else
      currentDate: now,
    });
    const { userId, role } = payload;
    if (typeof userId !== 'string' || !isUserRole(role)) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

export interface NewRefreshToken {
  /** Goes to the browser, once, in an httpOnly cookie. Never stored. */
  token: string;
  /** Goes in the database. A stolen database must not hand over live sessions. */
  tokenHash: string;
  expiresAt: Date;
}

/** SHA-256 is enough here: the token is 256 random bits, so there is nothing to brute-force. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newRefreshToken(now: Date = new Date()): NewRefreshToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  };
}
