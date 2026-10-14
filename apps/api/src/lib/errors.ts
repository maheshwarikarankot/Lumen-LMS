import type { ApiErrorDetail, ErrorCode } from '@lumen/shared';

/**
 * Throw one of these (via the helpers below) from anywhere in a route.
 * The global error handler turns it into the one error shape.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details: ApiErrorDetail[] = []) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const validationError = (details: ApiErrorDetail[]) =>
  new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);

export const unauthenticated = (message = 'You need to log in to do that') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const tooManyRequests = (message = 'Too many attempts. Try again later') =>
  new AppError(429, 'RATE_LIMITED', message);
