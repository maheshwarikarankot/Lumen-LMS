# 0004 — `position` columns are deferrable unique constraints

**Context.** `modules(course_id, position)` and `lessons(module_id, position)` must be unique, but reordering means swapping two positions. A normal unique index is checked row by row, so the first `UPDATE` of a swap fails even though the final state is valid.

**Options.**

- Keep a plain unique index and shuffle positions through a temporary value (two or three queries, easy to get wrong).
- Make the constraint `DEFERRABLE INITIALLY DEFERRED`, checked once at `COMMIT`.

**Decision.** Deferrable. Prisma cannot express it, so the constraints are written by hand in `prisma/migrations/20261013000000_init/migration.sql` (they replace the plain unique indexes Prisma would generate). `schema.prisma` still declares `@@unique` so the client knows about it.

**Consequence.** Reordering is one transaction. If a future `prisma migrate dev` regenerates those indexes, re-check that the migration still says `DEFERRABLE INITIALLY DEFERRED`.
