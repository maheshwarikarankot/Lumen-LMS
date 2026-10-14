import type { ApiErrorBody } from '@lumen/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { zodDetails } from './validate.js';

/** Anything that reaches this point matched no route. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`No route for ${req.method} ${req.path}`));
};

function toResponse(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are invalid',
          details: zodDetails(err),
        },
      },
    };
  }

  // Errors thrown by express.json() carry a `type`.
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    return {
      status: 400,
      body: {
        error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON', details: [] },
      },
    };
  }
  if (type === 'entity.too.large') {
    return {
      status: 413,
      body: { error: { code: 'BAD_REQUEST', message: 'Request body is too large', details: [] } },
    };
  }

  // A bug. Say nothing useful to the caller; the detail goes to the log.
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side',
        details: [],
      },
    },
  };
}

/** The one place errors become responses. Must have four arguments for Express to treat it so. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { status, body } = toResponse(err);
  // req.log carries the request id; fall back to the plain logger outside the full app.
  if (status >= 500) (req.log ?? logger).error({ err }, 'Unhandled error');
  res.status(status).json(body);
};
