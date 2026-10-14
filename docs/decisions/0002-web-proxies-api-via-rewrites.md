# 0002 — The web app proxies `/api/*` to the API

**Context.** The browser needs to call the Express API (`:4000`) from a page served by Next.js (`:3000`). Different ports are different origins.

**Options.**

- CORS on the API, with credentials, plus `SameSite`/`Secure` cookie care.
- A Next.js `rewrites()` rule forwarding `/api/*` to the API, so the browser only ever sees one origin.

**Decision.** Rewrites (`apps/web/next.config.ts`). The API stays a separate service and the web app still never touches the database.

**Consequence.** No `cors` dependency. The httpOnly auth cookies in Block B belong to a single origin. Server components call the API directly at `API_URL`. In production the same rule can become a reverse-proxy route.
