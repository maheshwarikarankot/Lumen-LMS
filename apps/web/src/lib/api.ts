import type { HealthResponse } from '@lumen/shared';

// Server-side code (server components, route handlers) calls the API directly.
// Browser code calls the same paths on the web app's own origin; next.config.ts proxies them.
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Never throws: `null` means the API could not be reached at all. */
export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
    // A 503 still carries a useful body ("db is down"), so read it either way.
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}
