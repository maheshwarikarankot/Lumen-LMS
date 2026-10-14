# 0007 — Integration tests run against a real Postgres, in a separate database

**Context.** The most important rules are in the database and in the permission checks: unique constraints, soft deletes, "a student gets 403", "a draft is invisible". A mocked Prisma cannot prove any of them.

**Options.**

- Mock Prisma everywhere. Fast, but proves nothing about constraints.
- SQLite or an in-memory fake. Different behaviour from Postgres (no deferrable constraints, no enums).
- The same Postgres container, a second database called `lumen_test`.

**Decision.** The third. Vitest has two projects. `unit` needs nothing. `integration` creates `lumen_test` if missing, runs `prisma migrate deploy` on it, and empties the tables before each test. Anything that deletes data refuses to run unless the database name ends in `_test`, so it can never touch dev data.

**Consequence.** `pnpm test` needs Docker running. Test files run one after another because they share a database. Unit-only runs (`test:unit`) stay instant and need no Docker.
