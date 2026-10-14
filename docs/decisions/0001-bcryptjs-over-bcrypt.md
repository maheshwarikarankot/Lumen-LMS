# 0001 — `bcryptjs` instead of `bcrypt`

**Context.** The spec says "bcrypt, cost 12". Two npm packages implement it: `bcrypt` (a native C++ addon) and `bcryptjs` (pure JavaScript, same algorithm and hash format).

**Options.**

- `bcrypt` — faster, but compiles or downloads a native binary on install. Our pnpm workspace blocks dependency build scripts (`allowBuilds`), and native addons are a classic source of "works on my machine" between macOS, WSL and CI.
- `bcryptjs` — no build step, identical `$2b$12$…` hashes, a few times slower.

**Decision.** `bcryptjs`, cost 12. Hashes are interchangeable, so switching to `bcrypt` later changes one import.

**Consequence.** A hash takes roughly 250–400 ms. That is fine for login/register and is even a mild brute-force brake; the seed script hashes once and reuses it.
