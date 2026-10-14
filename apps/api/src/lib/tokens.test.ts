import { SignJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

const payload = { userId: '0b8f3a53-7d0a-4a41-9e7c-5a1a3f1f6b11', role: 'INSTRUCTOR' } as const;

describe('access token', () => {
  it('round-trips the user id and role', async () => {
    const token = await signAccessToken(payload);
    expect(await verifyAccessToken(token)).toEqual(payload);
  });

  it('carries only userId, role and exp — nothing sensitive', async () => {
    const claims = decodeJwt(await signAccessToken(payload));
    expect(Object.keys(claims).sort()).toEqual(['exp', 'role', 'userId']);
  });

  it('expires after 15 minutes', async () => {
    const issued = new Date('2026-01-01T12:00:00Z');
    const token = await signAccessToken(payload, issued);
    const at = (seconds: number) => new Date(issued.getTime() + seconds * 1000);

    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(await verifyAccessToken(token, at(899))).toEqual(payload);
    expect(await verifyAccessToken(token, at(901))).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('some-other-secret-that-is-also-long-enough'));

    expect(await verifyAccessToken(forged)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const [header, , signature] = (await signAccessToken(payload)).split('.');
    const evil = Buffer.from(
      JSON.stringify({ ...payload, role: 'ADMIN', exp: 9999999999 }),
    ).toString('base64url');

    expect(await verifyAccessToken(`${header}.${evil}.${signature}`)).toBeNull();
  });

  it('rejects an unsigned token (alg: none)', async () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...payload, exp: 9999999999 })}.`;

    expect(await verifyAccessToken(unsigned)).toBeNull();
  });

  it('rejects garbage and an unknown role', async () => {
    expect(await verifyAccessToken('not-a-token')).toBeNull();
    expect(await verifyAccessToken('')).toBeNull();

    const odd = await signAccessToken({ userId: payload.userId, role: 'SUPERUSER' as never });
    expect(await verifyAccessToken(odd)).toBeNull();
  });
});

describe('refresh token', () => {
  it('is long, random and different every time', () => {
    const a = newRefreshToken();
    const b = newRefreshToken();

    expect(a.token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(a.token).not.toBe(b.token);
  });

  it('stores only a hash that matches the token', () => {
    const { token, tokenHash } = newRefreshToken();

    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });

  it('expires 7 days after it is issued', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const { expiresAt } = newRefreshToken(now);

    expect(REFRESH_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(expiresAt.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });
});
