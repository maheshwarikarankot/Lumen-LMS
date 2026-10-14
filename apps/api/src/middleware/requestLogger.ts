import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

// One log line per request, tagged with an id that is also sent back as `x-request-id`
// so a user-reported failure can be found in the logs.
export const requestLogger = pinoHttp({
  logger,
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health checks are noise.
  autoLogging: { ignore: (req) => req.url === '/api/health' },
});
