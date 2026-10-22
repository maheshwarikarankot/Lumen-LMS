import { type LoginInput, loginSchema } from '@lumen/shared';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { type LoginRateLimit, createLoginRateLimit } from './loginRateLimit.js';
import { getValidated, validate } from './validate.js';

// A stand-in for the login route: it always rejects the password, which is the case the
// limiter exists for.
function appWith(limit: LoginRateLimit) {
  const app = express();
  app.use(express.json());
  app.post('/login', validate({ body: loginSchema }), limit.middleware, (_req, res) => {
    const { body } = getValidated<LoginInput>(res);
    limit.recordFailure(body.email);
    res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
  });
  app.use(errorHandler);
  return app;
}

const attempt = (app: express.Express, email: string) =>
  request(app).post('/login').send({ email, password: 'wrong-password' });

let clock = 0;
let limit: LoginRateLimit;
let app: express.Express;

beforeEach(() => {
  clock = Date.UTC(2026, 0, 1);
  limit = createLoginRateLimit({ now: () => clock });
  app = appWith(limit);
});

describe('login rate limit', () => {
  it('allows five failures and refuses the sixth', async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect((await attempt(app, 'priya@lumen.test')).status, `attempt ${i}`).toBe(401);
    }

    const sixth = await attempt(app, 'priya@lumen.test');

    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
  });

  it('counts each email on its own', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(app, 'priya@lumen.test');

    expect((await attempt(app, 'priya@lumen.test')).status).toBe(429);
    expect((await attempt(app, 'sam@lumen.test')).status).toBe(401);
  });

  it('forgets failures once the window has passed', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(app, 'priya@lumen.test');
    expect((await attempt(app, 'priya@lumen.test')).status).toBe(429);

    clock += 15 * 60 * 1000 + 1;

    expect((await attempt(app, 'priya@lumen.test')).status).toBe(401);
  });

  it('keeps blocking while failures keep coming inside the window', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(app, 'priya@lumen.test');

    clock += 14 * 60 * 1000; // still inside the 15-minute window

    expect((await attempt(app, 'priya@lumen.test')).status).toBe(429);
  });

  it('starts over after a success clears the count', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(app, 'priya@lumen.test');

    limit.clearFailures('priya@lumen.test'); // what the route does on a correct password

    expect((await attempt(app, 'priya@lumen.test')).status).toBe(401);
  });

  it('refuses before the password is looked at', async () => {
    let handlerRuns = 0;
    const counted = express();
    counted.use(express.json());
    counted.post('/login', validate({ body: loginSchema }), limit.middleware, (_req, res) => {
      handlerRuns += 1;
      const { body } = getValidated<LoginInput>(res);
      limit.recordFailure(body.email);
      res.status(401).end();
    });
    counted.use(errorHandler);

    for (let i = 0; i < 6; i += 1) await attempt(counted, 'priya@lumen.test');

    expect(handlerRuns).toBe(5); // the sixth never reached it
  });

  it('still lets a bad request through to validation', async () => {
    const res = await request(app).post('/login').send({ email: '', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
