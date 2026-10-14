# 0006 — `jose` for the access token

**Context.** The access token is a short-lived JWT (15 minutes) holding `userId`, `role` and `exp`. We need to sign and verify it.

**Options.**

- `jsonwebtoken` — the long-time default, CommonJS, bigger surface.
- `jose` — pure JavaScript, ESM, no native code, same reasons as [0001](./0001-bcryptjs-over-bcrypt.md).
- Hand-rolled HMAC — no. Rolling your own token format is how auth bugs start.

**Decision.** `jose`, HS256, verification restricted to `algorithms: ['HS256']` so "alg: none" tokens are refused. The secret is `JWT_ACCESS_SECRET` (at least 32 characters, checked at startup).

**Consequence.** Changing the secret logs everyone out of their current access token (refresh tokens are separate and live in the database). The `role` in the token is only a hint for the UI. Permission checks read the role from the database on every request.
