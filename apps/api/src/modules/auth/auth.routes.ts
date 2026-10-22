import { type LoginInput, type RegisterInput, loginSchema, registerSchema } from '@lumen/shared';
import { Router } from 'express';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../../lib/cookies.js';
import { AppError } from '../../lib/errors.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { createLoginRateLimit } from '../../middleware/loginRateLimit.js';
import { getValidated, validate } from '../../middleware/validate.js';
import { toUser } from './auth.mapper.js';
import { currentUser, login, refresh, register } from './auth.service.js';

// Who may call what:
//   POST /register  public
//   POST /login     public (rate limited per email)
//   POST /refresh   anyone holding a valid refresh cookie
//   GET  /me        any logged-in user

export const authRouter = Router();

/** Exported so tests can clear the counters between cases. */
export const loginLimit = createLoginRateLimit();

// Nothing here should sit in a cache — not in the browser, not in a proxy. It also stops the
// back button from showing a logged-in page after logout (story 1.4).
authRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

authRouter.post('/register', validate({ body: registerSchema }), async (_req, res) => {
  const { body } = getValidated<RegisterInput>(res);

  const session = await register(body);

  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.status(201).json(toUser(session.user));
});

authRouter.post(
  '/login',
  validate({ body: loginSchema }),
  loginLimit.middleware,
  async (_req, res) => {
    const { body } = getValidated<LoginInput>(res);

    try {
      const session = await login(body);
      loginLimit.clearFailures(body.email);

      setAuthCookies(res, session.accessToken, session.refreshToken);
      res.json(toUser(session.user));
    } catch (error) {
      // Count only rejected credentials. A database outage is not a failed attempt, and
      // locking people out because the database blinked would be its own small disaster.
      if (error instanceof AppError && error.status === 401) {
        loginLimit.recordFailure(body.email);
      }
      throw error;
    }
  },
);

authRouter.post('/refresh', async (req, res) => {
  try {
    const session = await refresh(req.cookies[REFRESH_COOKIE]);

    setAuthCookies(res, session.accessToken, session.refreshToken);
    res.json(toUser(session.user));
  } catch (error) {
    // The session is over. Clear the cookies so the browser stops presenting dead tokens.
    clearAuthCookies(res);
    throw error;
  }
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json(toUser(await currentUser(requireUser(req).id)));
});
