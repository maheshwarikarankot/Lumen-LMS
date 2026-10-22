import type { ApiErrorDetail } from '@lumen/shared';
import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { validationError } from '../lib/errors.js';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/** The parsed (and therefore trusted) request input, keyed like the schemas. */
export interface Validated<B = unknown, Q = unknown, P = unknown> {
  body: B;
  query: Q;
  params: P;
}

/**
 * Validate the request at the edge, so a route handler never sees raw input.
 * Failures become a 400 VALIDATION_ERROR listing every bad field.
 *
 *   router.post('/x', validate({ body: schema }), (req, res) => {
 *     const { body } = getValidated<z.infer<typeof schema>>(res);
 *   });
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const details: ApiErrorDetail[] = [];
    const validated: Partial<Validated> = {};

    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (result.success) {
        validated[key] = result.data;
      } else {
        details.push(...zodDetails(result.error, key === 'body' ? undefined : key));
      }
    }

    if (details.length > 0) return next(validationError(details));

    res.locals['validated'] = validated;
    next();
  };
}

export function getValidated<B = unknown, Q = unknown, P = unknown>(
  res: Response,
): Validated<B, Q, P> {
  return res.locals['validated'] as Validated<B, Q, P>;
}

export function zodDetails(error: z.ZodError, prefix?: string): ApiErrorDetail[] {
  return error.issues.flatMap((issue) => {
    const base = prefix ? [prefix, ...issue.path.map(String)] : issue.path.map(String);

    // Zod reports an unexpected key against the object, not the key, so name the keys here —
    // "Unexpected field \"role\"" is actionable, "Unrecognized key" on an empty path is not.
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: [...base, key].join('.'),
        message: `Unexpected field "${key}"`,
      }));
    }

    return [{ path: base.join('.'), message: issue.message }];
  });
}
