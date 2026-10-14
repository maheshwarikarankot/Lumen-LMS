import type { HealthResponse } from '@lumen/shared';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

// Uptime + a real round trip to the database. 503 when Postgres is unreachable, so a
// load balancer or `curl -f` notices.
healthRouter.get('/health', async (req, res) => {
  let db: HealthResponse['db'] = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    req.log.error({ err }, 'Health check: database unreachable');
    db = 'down';
  }

  const body: HealthResponse = {
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
  res.status(db === 'up' ? 200 : 503).json(body);
});
