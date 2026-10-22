import type { RequestHandler } from 'express';
import { tooManyRequests } from '../lib/errors.js';

// Story 1.2: "Six failed attempts on one email within 15 minutes returns 429." So five failures
// are allowed, and the sixth attempt is refused before the password is even checked.
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface LoginRateLimitOptions {
  maxFailures?: number;
  windowMs?: number;
  /** Injectable so a test can move the clock instead of waiting fifteen minutes. */
  now?: () => number;
}

export interface LoginRateLimit {
  /** Runs after validate(), so the key is the normalised email, not whatever was typed. */
  middleware: RequestHandler;
  recordFailure(email: string): void;
  clearFailures(email: string): void;
  reset(): void;
}

/**
 * Counts failed logins per email, in memory.
 *
 * In memory means per process: with two API instances behind a load balancer, an attacker gets
 * five tries on each. That is fine for now and wrong for production — moving the counter to the
 * database or Redis is the fix. Noted in docs/decisions/0008.
 *
 * Keyed by email, not by IP: the thing being protected is one account, and the attacker picks
 * the IP. An IP limit belongs in front of the whole API, not here.
 */
export function createLoginRateLimit(options: LoginRateLimitOptions = {}): LoginRateLimit {
  const maxFailures = options.maxFailures ?? LOGIN_MAX_FAILURES;
  const windowMs = options.windowMs ?? LOGIN_WINDOW_MS;
  const now = options.now ?? (() => Date.now());

  /** email -> timestamps of its recent failures */
  const failures = new Map<string, number[]>();
  let lastSweep = now();

  const recent = (times: number[], at: number): number[] => times.filter((t) => at - t < windowMs);

  /** Without this the map would keep a key for every email ever tried. */
  function sweep(at: number): void {
    if (at - lastSweep < windowMs) return;
    lastSweep = at;
    for (const [email, times] of failures) {
      const left = recent(times, at);
      if (left.length === 0) failures.delete(email);
      else failures.set(email, left);
    }
  }

  function emailFrom(locals: Record<string, unknown>): string | undefined {
    const validated = locals['validated'] as { body?: { email?: unknown } } | undefined;
    return typeof validated?.body?.email === 'string' ? validated.body.email : undefined;
  }

  return {
    middleware(_req, res, next) {
      const at = now();
      sweep(at);

      const email = emailFrom(res.locals);
      if (!email) return next(); // validate() rejects a missing email before this runs

      if (recent(failures.get(email) ?? [], at).length >= maxFailures) {
        return next(tooManyRequests('Too many failed attempts. Try again in a few minutes'));
      }
      next();
    },

    recordFailure(email) {
      const at = now();
      failures.set(email, [...recent(failures.get(email) ?? [], at), at]);
    },

    clearFailures(email) {
      failures.delete(email);
    },

    reset() {
      failures.clear();
      lastSweep = now();
    },
  };
}
