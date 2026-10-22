import type { Request, RequestHandler } from 'express';
import type { UserRole } from '@lumen/shared';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { unauthenticated } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

/**
 * `Authorization: Bearer <token>` wins over the cookie. The browser uses the cookie; the header
 * is what you reach for from a terminal, which is how the review demo proves a 403 is real.
 */
function readToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || undefined;
  }
  return req.cookies[ACCESS_COOKIE];
}

/**
 * Answers "who are you?" and nothing else. Permission ("may you?") is a separate middleware,
 * because they fail differently: no answer here is 401, a refused permission is 403.
 *
 * The user is re-read from the database on every request. That costs one query, and buys the
 * thing the spec asks for: an admin who demotes someone, or deletes them, takes effect now
 * instead of whenever their 15-minute token happens to run out.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = readToken(req);
  if (!token) return next(unauthenticated());

  const payload = await verifyAccessToken(token);
  if (!payload) return next(unauthenticated());

  const user = await prisma.user.findFirst({
    where: { id: payload.userId, deletedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!user) return next(unauthenticated());

  // The role comes from this row, never from payload.role. The token's copy is a hint for the
  // UI and can be 15 minutes out of date.
  req.user = user;
  next();
};

/**
 * The caller, for a handler that runs behind `authenticate`.
 *
 * It throws rather than returning undefined, so forgetting the middleware on a route fails
 * loudly as a 401 instead of quietly reading `undefined.id`.
 */
export function requireUser(req: Request): { id: string; email: string; role: UserRole } {
  if (!req.user) throw unauthenticated();
  return req.user;
}
