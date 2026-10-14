import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from './app.js';
import { AppError, forbidden } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getValidated, validate } from './middleware/validate.js';

// No database in unit tests: swap the Prisma client for a stub.
vi.mock('./lib/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));

const queryRaw = vi.mocked(prisma.$queryRaw);

beforeEach(() => {
  queryRaw.mockReset();
});

describe('GET /api/health', () => {
  it('returns 200 when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('returns 503 when the database is down', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('tags every response with a request id', async () => {
    queryRaw.mockResolvedValue([]);
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('the one error shape', () => {
  it('404s unknown routes in the standard shape', async () => {
    const res = await request(createApp()).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope', details: [] },
    });
  });

  it('answers malformed JSON with 400, not a crash', async () => {
    const res = await request(createApp())
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

/** A tiny app with routes that fail in the ways real routes will. */
function appWithRoutes(setup: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  setup(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('error handler', () => {
  it('maps AppError to its status and code', async () => {
    const app = appWithRoutes((a) =>
      a.get('/boom', () => {
        throw forbidden();
      }),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('keeps AppError details', async () => {
    const app = appWithRoutes((a) =>
      a.get('/boom', () => {
        throw new AppError(409, 'CONFLICT', 'Taken', [{ path: 'email', message: 'in use' }]);
      }),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([{ path: 'email', message: 'in use' }]);
  });

  it('hides the cause of unexpected errors', async () => {
    const app = appWithRoutes((a) =>
      a.get('/boom', () => {
        throw new Error('secret SQL detail');
      }),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('validate()', () => {
  const body = z.object({ email: z.email(), age: z.number().int().min(18) });
  const query = z.object({ page: z.coerce.number().int().min(1).default(1) });

  const app = appWithRoutes((a) =>
    a.post('/things', validate({ body, query }), (_req, res) => {
      res.json(getValidated<z.infer<typeof body>, z.infer<typeof query>>(res));
    }),
  );

  it('lists every bad field at once', async () => {
    const res = await request(app).post('/things').send({ email: 'nope', age: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'age']));
  });

  it('hands the handler parsed values', async () => {
    const res = await request(app).post('/things?page=2').send({ email: 'a@b.co', age: 30 });

    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({ page: 2 });
    expect(res.body.body).toEqual({ email: 'a@b.co', age: 30 });
  });
});
