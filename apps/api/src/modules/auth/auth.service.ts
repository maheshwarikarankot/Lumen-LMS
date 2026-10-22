import type { LoginInput, RegisterInput, UserRole } from '@lumen/shared';
import type { User as UserRow } from '../../generated/prisma/client.js';
import { conflict, unauthenticated } from '../../lib/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password.js';
import { isUniqueViolation, prisma } from '../../lib/prisma.js';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../../lib/tokens.js';

/**
 * Wrong password and unknown email get the same sentence. Different wording would let anyone
 * discover which emails have accounts here, one guess at a time.
 */
const BAD_CREDENTIALS = 'Incorrect email or password';

/** Expired, revoked, reused, unknown — the caller learns only that they must log in again. */
const SESSION_ENDED = 'Your session has ended. Please log in again';

export interface Session {
  user: UserRow;
  /** Short-lived (15 min). Goes in an httpOnly cookie. */
  accessToken: string;
  /** Long-lived (7 days), stored only as a hash. Goes in an httpOnly cookie. */
  refreshToken: string;
}

/** Issues a fresh pair and records the refresh token's hash against the user. */
async function startSession(user: { id: string; role: UserRole }): Promise<Omit<Session, 'user'>> {
  const refresh = newRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
  });
  return {
    accessToken: await signAccessToken({ userId: user.id, role: user.role }),
    refreshToken: refresh.token,
  };
}

/**
 * Story 1.1. The role is whatever the form sent — but the schema only allows STUDENT or
 * INSTRUCTOR, so this cannot mint an admin.
 */
export async function register(input: RegisterInput): Promise<Session> {
  const passwordHash = await hashPassword(input.password);

  let user: UserRow;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        passwordHash,
      },
    });
  } catch (error) {
    // The unique index is the real guard, not a "does this email exist?" query above.
    // Note: a soft-deleted account still holds its email, so that address stays taken.
    if (isUniqueViolation(error, 'email')) {
      throw conflict('An account with this email already exists');
    }
    throw error;
  }

  return { user, ...(await startSession(user)) };
}

/** Story 1.2. */
export async function login(input: LoginInput): Promise<Session> {
  const user = await prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });

  // Hash a dummy password when there is no such user, so answering "no account" takes as long
  // as answering "wrong password". Otherwise the clock alone tells an attacker which is which.
  const correct = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !correct) throw unauthenticated(BAD_CREDENTIALS);

  return { user, ...(await startSession(user)) };
}

/**
 * Story 1.3. Rotation: the token handed in stops working the moment a new one is handed out,
 * so a stolen refresh token is useful only until the real browser next refreshes.
 *
 * All of it runs in one transaction, so two tabs refreshing at the same instant cannot both
 * walk away with a new session.
 */
export async function refresh(rawToken: string | undefined): Promise<Session> {
  if (!rawToken) throw unauthenticated(SESSION_ENDED);
  const tokenHash = hashRefreshToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const stored = await tx.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored) throw unauthenticated(SESSION_ENDED);

    // This token was already rotated away. Either it was stolen and is being replayed, or a
    // client is confused. Either way, end every session this user has and make them log in.
    if (stored.revokedAt) {
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw unauthenticated(SESSION_ENDED);
    }

    if (stored.expiresAt <= new Date() || stored.user.deletedAt) {
      throw unauthenticated(SESSION_ENDED);
    }

    // Let the database decide the race: only one caller can move revokedAt away from null.
    const rotated = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count !== 1) throw unauthenticated(SESSION_ENDED);

    const next = newRefreshToken();
    await tx.refreshToken.create({
      data: { userId: stored.userId, tokenHash: next.tokenHash, expiresAt: next.expiresAt },
    });

    return {
      user: stored.user,
      // Signed from the row we just read, so a role changed a minute ago is already in effect.
      accessToken: await signAccessToken({ userId: stored.user.id, role: stored.user.role }),
      refreshToken: next.token,
    };
  });
}

/**
 * The full row behind `req.user`, for GET /api/auth/me. The middleware keeps only id, email and
 * role, so the name and avatar are fetched here rather than carried around on every request.
 */
export async function currentUser(userId: string): Promise<UserRow> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw unauthenticated();
  return user;
}
