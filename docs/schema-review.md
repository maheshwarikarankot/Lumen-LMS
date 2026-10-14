# Schema review — prep sheet

Block A has a hard gate: **schema review with your mentor before any feature code.** Bring this, the ERD (`docs/Lumen LMS data model.png`) and `apps/api/prisma/schema.prisma`.

## Check before you go

- [ ] ERD matches the schema — see [decision 0005](./decisions/0005-schema-follows-the-spec-over-the-erd-sketch.md) for the differences to fix in the diagram
- [ ] `pnpm db:migrate` applied cleanly to a fresh database and reported **no** drift
- [ ] In Prisma Studio or your DB GUI: all six tables exist; unique indexes on `users.email`, `courses.slug`, `enrollments(course_id, student_id)`
- [ ] The two position constraints are deferrable (see below)

Verify the deferrable constraints:

```sql
SELECT conname, condeferrable, condeferred
FROM pg_constraint
WHERE conname IN ('modules_course_id_position_key', 'lessons_module_id_position_key');
-- both rows: t | t
```

## The four questions — draft answers (make them your own)

**1. What happens to a published course when its instructor is deleted?**
Users are soft-deleted, so nothing is removed and `courses.instructor_id` stays valid. The foreign key is `ON DELETE RESTRICT`, so a real `DELETE` of that user fails loudly instead of orphaning or cascading. The API additionally blocks soft-deleting an instructor who owns published courses (`409`, with the count) — the admin must unpublish or reassign first.

**2. Two instructors create "Intro to React" on the same day. What are the slugs?**
`intro-to-react` and `intro-to-react-2`. `slug` is unique in the database; the API generates the slug and on collision appends `-2`, `-3`, … The unique index — not the application check — is the final guard if two requests race (the loser retries with the next suffix).

**3. A course is published, then reverted to draft. What do enrolled students see?**
Enrollments are not touched, so students keep their enrollment row and progress. Draft means "not visible in the catalog and not joinable"; whether already-enrolled students can keep reading is a **product decision to raise with your mentor** (the schema supports either). `published_at` keeps its first-publish value.

**4. Why is `position` an integer and not just row order?**
A relational table has no inherent order — without a column, "lesson 2" is not stored anywhere. An integer also lets reordering be an explicit change (swap two numbers) that can be validated and is stable across queries. The uniqueness is deferrable so a swap inside one transaction does not trip over itself halfway.

## Deliberate choices worth defending

- `enrollments` FKs are `RESTRICT`, not cascade: a student's history is never destroyed as a side effect.
- `refresh_tokens.token_hash`: only a hash is stored, so a stolen database does not hand over live sessions.
- Extra database-level rules (`CHECK`): lowercase email, title 3–120 chars, summary ≤ 300 chars. The API validates too; the DB is the last line of defence.
- No `updated_at` on `enrollments` / `refresh_tokens` — the spec has none; timestamps there are event times.
