// Wire formats shared by every endpoint. See docs/api.md.

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** One problem with one field, e.g. { path: 'email', message: 'Invalid email' }. */
export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** The one error shape. Every non-2xx response from the API has exactly this body. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: ApiErrorDetail[];
  };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The one list envelope. Every list endpoint returns this. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptimeSeconds: number;
  /** ISO-8601, UTC */
  timestamp: string;
}
