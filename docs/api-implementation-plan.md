# API implementation plan

This file says **how** we build each endpoint, one step at a time.
It sits on top of three things:

- The user stories 1.1 to 1.13 in `PHASE-1.md` (the "what").
- The endpoint table in [`api.md`](./api.md) (the contract).
- The REST API assignment from the Node.js course ([reference](https://github.com/AlreadyBored/nodejs-assignments/blob/main/assignments-v2/05-kh-rest-api/assignment.md)), which shows good habits for layering, validation and status codes.

Our stack is Express, Zod and Prisma.
The reference uses Nest.js and in-memory data.
So we copy the **habits**, not the tools.

---

## 1. What we borrow from the reference, and what we change

| Reference assignment                                       | What we do                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Code split by domain, each with a controller and a service | One folder per domain in `src/modules/`. Routes (thin) → service (the logic) → Prisma.                                           |
| Business logic lives in services, not controllers          | Same rule. A route handler is about ten lines: read validated input, call a service, send the result.                            |
| DTO classes + a global validation pipe                     | Zod schemas + the `validate()` middleware we already have. Schemas live in `@lumen/shared`, so the web forms use the same rules. |
| Invalid (non-UUID) id → `400`                              | Every `:id` param is checked with `z.uuid()` first. Bad id → `400 VALIDATION_ERROR`.                                             |
| Not found → `404`, missing field → `400`                   | Same, using the helpers in `lib/errors.ts`.                                                                                      |
| Never return the password                                  | Same. We never select `passwordHash` into a response. A mapper builds every response object (see 2.3).                           |
| Cascade rules written down per delete                      | We **soft delete** users and courses, so we write our own rules (see step 12 and step 9).                                        |
| Filters through the query string (`?status=...&tag=...`)   | Catalog filters: `?q=`, `?level=`, `?page=`.                                                                                     |
| Request logging as a cross-cutting piece                   | Done already (`pino-http`). Auth and role checks are new middleware.                                                             |
| Data source easy to swap (in-memory now, DB later)         | Only services touch Prisma. Routes never import it. Swapping the data source means editing services only.                        |
| Port from `.env`                                           | Done (`API_PORT`, default `4000`).                                                                                               |
| OpenAPI docs at `/doc` (`@nestjs/swagger`)                 | **Not in Foundations.** `docs/api.md` is our contract. See the stretch idea in step 14.                                          |
| `422` when a referenced entity does not exist              | We have no such case in Foundations. If one appears, `404` or `409` with a clear message.                                        |
| `PUT` to update                                            | We use `PATCH` (partial update), as the contract says.                                                                           |

---

## 2. How the code is organised

### 2.1 Folders

```
apps/api/src/
  config/env.ts            env vars, parsed once            (exists)
  lib/
    errors.ts              AppError + helpers               (exists)
    slug.ts                slugify                          (exists)
    prisma.ts, logger.ts                                    (exist)
    password.ts            hash + compare (bcryptjs)        (new)
    tokens.ts              access JWT + refresh token       (new)
    cookies.ts             set / clear auth cookies         (new)
    pagination.ts          page maths + envelope            (new)
  middleware/
    validate.ts, errorHandler.ts, requestLogger.ts          (exist)
    authenticate.ts        who are you?                     (new)
    requireRole.ts         may you do this?                 (new)
    loginRateLimit.ts      6 failures -> 429                (new)
  modules/
    auth/        auth.routes.ts   auth.service.ts   auth.mapper.ts
    courses/     courses.routes.ts   courses.service.ts   courses.mapper.ts
    instructor/  instructor.routes.ts
    admin/       admin-users.routes.ts   admin-users.service.ts
  routes/index.ts          mounts every router under /api   (exists)
  types/express.d.ts       adds req.user
```

Shared Zod schemas go in `packages/shared/src/schemas/` (`auth.ts`, `course.ts`, `admin.ts`, `common.ts`).
That means `zod` becomes a dependency of `@lumen/shared`.

### 2.2 What happens to a request

```
request
  → requestLogger → express.json
  → route:  validate() → authenticate → requireRole(...) → handler
  → service  (rules + Prisma)
  → mapper   (DB row → safe response object)
  → res.json

any throw  → errorHandler → { error: { code, message, details } }
```

Rules for every route:

1. **Validate first.** A handler never sees raw input.
2. **Authenticate, then authorize.** These are two separate middleware. Role checks use the **fresh database row**, never the token's `role`.
3. **Check ownership in the service**, not in the browser and not in the route file.
4. **Throw `AppError` helpers.** Never write `res.status(404).json(...)` by hand.
5. **No `try/catch` that only logs.** Let errors reach the global handler. Express 5 forwards async errors by itself.

### 2.3 Mappers: the password guard

Every response is built by a mapper such as `toUser(row)`.
It copies the safe fields **by name**.
A new column can never leak by accident, because it is not copied until someone adds it.
`passwordHash` and `deletedAt` are never copied.
Each mapper returns a type from `@lumen/shared` (`User`, `CourseSummary`, `Course`).

### 2.4 Response shapes (decisions to confirm with your mentor)

- Lists: `{ data: [...], meta: { page, pageSize, total, totalPages } }` (fixed by the spec).
- A single thing: the object itself, with no wrapper. `GET /api/auth/me` returns the `User` object.
- Create → `201`. Read, update, publish → `200`. Logout and delete → `204` with no body.
- Errors: always `{ error: { code, message, details } }`.

### 2.5 New dependencies (one reason each)

| Package                  | Why                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `jose`                   | Sign and verify the access JWT. Pure JavaScript, no native build (same reason as `bcryptjs`). |
| `cookie-parser`          | Read the auth cookies. Small and standard.                                                    |
| `zod` in `@lumen/shared` | Web and API share one set of validation rules.                                                |

No rate-limit package. A login limiter is about 30 lines (step 3), and it needs a custom key (the email), so we write it.

### 2.6 New env vars

Add each one to `.env.example` **with a comment**, to `config/env.ts`, and tell the team.

```
JWT_ACCESS_SECRET=   # at least 32 random characters:  openssl rand -base64 48
```

The token lifetimes (15 minutes, 7 days) are constants in `lib/tokens.ts`, not env vars.
The `Secure` cookie flag is on when `NODE_ENV=production`.

---

## 3. Story → endpoint → step

| Story                     | What                      | Endpoint(s)                                               | Step |
| ------------------------- | ------------------------- | --------------------------------------------------------- | ---- |
| 1.1 Sign up               | Create account            | `POST /api/auth/register`                                 | 2    |
| 1.2 Log in                | Cookies, rate limit       | `POST /api/auth/login`                                    | 3    |
| 1.3 Stay logged in        | Rotate tokens, who am I   | `POST /api/auth/refresh`, `GET /api/auth/me`              | 4    |
| 1.4 Log out               | Revoke                    | `POST /api/auth/logout`                                   | 5    |
| 1.5 Route protection      | Auth + role middleware    | every protected route                                     | 6    |
| 1.6 Create a course       | Draft + slug              | `POST /api/courses`                                       | 7    |
| 1.7 My courses            | Own list                  | `GET /api/instructor/courses`                             | 8    |
| 1.8 Edit and delete       | Owner checks, soft delete | `PATCH`, `DELETE /api/courses/:id`                        | 9    |
| 1.9 Publish and unpublish | State machine             | `POST /api/courses/:id/publish`, `/unpublish`, `/archive` | 10   |
| 1.10 Catalog              | Search, filter, pages     | `GET /api/courses`                                        | 11   |
| 1.11 Course detail        | One course                | `GET /api/courses/:slug`                                  | 11   |
| 1.12 Admin users          | Manage people             | `GET /api/admin/users`, `PATCH .../role`, `DELETE ...`    | 12   |
| 1.13 Seed data            | Demo data                 | `pnpm db:seed`                                            | 13   |

Build order follows Foundations: **Block B** is steps 1 to 6 (identity and access).
**Block C** is steps 7 to 13 (courses, catalog, admin).
Open one pull request per step (or per two small steps), under about 400 changed lines.

---

## 4. Steps

Each step has the same parts: **Build**, **Rules**, **Errors**, **Tests**, **Done when**.
"Tests" means API tests with `supertest` against a real test database (see step 0).

### Step 0. Test harness (before any feature)

Goal: tests that hit a real Postgres, so we can prove permissions and constraints.

Build:

1. Add a second database, `lumen_test`, in the same Docker Postgres.
2. A vitest `globalSetup` creates it if missing and runs `prisma migrate deploy` against it. A guard refuses to touch any database whose name does not end in `_test`.
3. A `test/helpers.ts` with `resetDb()` (truncate all tables between tests) and `createUser({ role })`.
4. Name integration files `*.int.test.ts`. Vitest has two projects: `unit` (no database, mocked Prisma) and `integration` (real Postgres). `pnpm test` runs both.
5. Add helpers. `agentFor(user)` returns a supertest agent that already carries a valid access cookie. `createUser` and `createCourse` insert rows. (A helper that logs in through the real endpoint arrives with step 3.)

Done when: one integration test creates a user in the test DB and reads it back. **Built.** The same file also proves the migration rules: lowercase email, title and summary length, unique slug, one enrollment per student, deferrable position swap.

### Step 1. Auth building blocks

Goal: small pure helpers that steps 2 to 6 reuse.

Build:

1. `lib/password.ts`: `hashPassword`, `verifyPassword` (bcryptjs, **cost 12**). Also a constant `DUMMY_HASH`, a real cost-12 hash of a password nobody knows, used in step 3.
2. `lib/tokens.ts`:
   - `signAccessToken({ userId, role })` → JWT, **15 min**, payload is `userId`, `role`, `exp` only.
   - `verifyAccessToken(token)` → payload or `null`.
   - `newRefreshToken()` → 32 random bytes (base64url). Returns the raw token and its **SHA-256 hash**. Only the hash goes in the database. SHA-256 is fine here because the token is long and random (unlike a password).
3. `lib/cookies.ts`: `setAuthCookies(res, access, refresh)` and `clearAuthCookies(res)`.
   - Names: `lumen_access` (path `/`, 15 min) and `lumen_refresh` (path `/api/auth`, 7 days).
   - Flags on both: `httpOnly`, `sameSite: 'lax'`, `secure` only in production.
4. Shared Zod schemas in `packages/shared/src/schemas/`:
   - `common.ts`: `idParam = z.object({ id: z.uuid() })`, `slugParam`, `pageQuery`.
   - `auth.ts`: see step 2.

Tests: unit tests for each helper. A token signed with the wrong secret or past `exp` must not verify.

Done when: helpers are covered and nothing else is wired yet. **Built**, except the `auth.ts` schemas, which come with step 2.

### Step 2. `POST /api/auth/register` (story 1.1)

Who: public. Success: `201` with the `User` object, cookies set.

Build:

1. Schema `registerSchema`:
   - `fullName`: trimmed, 1 to 100 chars.
   - `email`: trimmed, lowercased, valid email.
   - `password`: at least 8 chars, at least one letter and one number.
   - `role`: only `STUDENT` or `INSTRUCTOR`. Anything else, `ADMIN` included, is a `400`.
2. Service `register(input)`:
   1. Hash the password (cost 12).
   2. `prisma.user.create(...)`. The role comes from the body, never from anything else.
   3. Create a refresh token row (hash, `expiresAt` = now + 7 days).
   4. Return the user row and both raw tokens.
3. Route sets the cookies and returns `toUser(row)`.

Rules:

- Catch the Prisma unique error (`P2002`) on `email` and throw `conflict('An account with this email already exists')`. Do **not** check "does it exist" first, because two fast clicks would both pass the check. The database constraint is the real guard.
- The email is stored lowercased. The DB check constraint is a second guard.
- Known limit to discuss: a soft-deleted user still holds the email, so it cannot be registered again (`409`).

Errors: `400 VALIDATION_ERROR` with `details` per field, `409 CONFLICT`.

Tests: happy path (user row exists, hash starts with `$2`, cost is 12); response has no `passwordHash`; duplicate email (also with different letter case) → `409` with the exact message; `role: "ADMIN"` → `400`; weak password → `400` with the `password` path; bad email → `400`.

Done when: every box in story 1.1 that belongs to the API is checked.

### Step 3. `POST /api/auth/login` (story 1.2)

Who: public. Success: `200` with the `User` object, cookies set.

Build:

1. Schema: `email` (trim, lowercase), `password` (non-empty).
2. Service `login(email, password)`:
   1. Find the user by email where `deletedAt` is null.
   2. Run `verifyPassword` **even if the user was not found**, against `DUMMY_HASH`. This keeps the response time the same, so timing does not reveal which emails exist.
   3. If anything fails, throw `unauthenticated('Incorrect email or password')`. Wrong password and unknown email get the **same** message. A soft-deleted user gets it too.
   4. On success, create a refresh token row and return the tokens.
3. `middleware/loginRateLimit.ts`:
   - Count **failed** logins per email in a `Map` (key = lowercased email; value = failure timestamps).
   - A failure inside the last 15 minutes counts. After 5 failures, the next attempt (the 6th) gets `429 RATE_LIMITED` before any password check.
   - A successful login clears that email's counter.
   - Take a `now()` function as a parameter so tests can move the clock.
   - Remove old entries so the Map does not grow forever.
4. Route order: `validate → loginRateLimit → handler`.

Rules:

- The limiter is in memory, so it works for one API instance only. That is fine for now. Write that in `docs/decisions/` and move it to the database or Redis if we ever run more than one instance.
- Never log the password or the token.

Errors: `400`, `401 UNAUTHENTICATED`, `429 RATE_LIMITED`.

Tests: correct login sets **both** cookies, both `HttpOnly`; wrong password and unknown email return identical status and body; soft-deleted user → `401`; five wrong attempts → `401` each, the sixth → `429`; a success resets the count; the access token payload has only `userId`, `role`, `exp`.

Done when: story 1.2 API boxes are checked.

### Step 4. `POST /api/auth/refresh` and `GET /api/auth/me` (story 1.3)

**Refresh.** Who: the refresh cookie. Success: `200`, new cookies.

Build, inside **one database transaction**:

1. Read `lumen_refresh`. Missing → `401`.
2. Hash it and find the row by `tokenHash`.
3. The row must exist, `revokedAt` must be null, `expiresAt` must be in the future, and its user must not be soft-deleted. Otherwise → `401` and clear the cookies.
4. Mark the old row `revokedAt = now()`. Create a new row. Sign a new access token with the **current** role from the database.
5. Set the new cookies.

Rules:

- **Rotation:** the old token stops working at once.
- If someone presents a token that is already revoked, treat it as theft: revoke **all** of that user's refresh tokens and return `401`. (Small extra, big safety win.)
- Two calls with the same token at the same moment: one wins, the other gets `401`. The web client must send only one refresh at a time (story 1.3, a web task). Make the revoke step `updateMany ... where revokedAt is null` and check `count === 1` so the race is decided by the database.

**Me.** Who: any logged-in user. Success: `200` with the `User` object (loaded by the `authenticate` middleware from step 6), or `401`.

Tests: refresh returns new cookies and the old refresh token then fails; expired token → `401`; revoked token → `401` and all the user's tokens revoked; soft-deleted user → `401`; two parallel refreshes with one token → exactly one `200`; `me` without cookie → `401`; `me` with a role changed in the DB shows the **new** role.

Done when: story 1.3 API boxes are checked.

### Step 5. `POST /api/auth/logout` (story 1.4)

Who: any user. Success: `204`.

Build:

1. Read `lumen_refresh`. If present, set `revokedAt = now()` for the matching row (if it is not already revoked).
2. Always clear both cookies and return `204`, even if the cookie was missing or unknown. Logging out twice should not be an error.

Rules:

- Clearing a cookie alone is not logging out. The **database row** must be revoked.
- Do not require a valid access token. A user with an expired access token must still be able to log out.
- Send `Cache-Control: no-store` on auth responses. The web "Back button shows a cached page" check is on the web side, but this header helps.

Tests: after logout the old refresh token cannot refresh (`401`); both `Set-Cookie` headers clear the cookies; calling logout twice → `204` both times; logout without any cookie → `204`.

Done when: story 1.4 API boxes are checked.

### Step 6. Auth and role middleware (story 1.5)

Goal: the two checks, as two separate steps.

Build:

1. `middleware/authenticate.ts`:
   1. Take the token from `Authorization: Bearer <token>` first, then from the `lumen_access` cookie. (The Bearer form is what you use from the terminal in the review demo.)
   2. `verifyAccessToken`. Missing or bad → `401`.
   3. **Load the user from the database** by `userId`. Not found or `deletedAt` set → `401`.
   4. Put the **database row's** `id`, `email`, `role` on `req.user`. Never copy `role` from the token.
2. `types/express.d.ts`: add `user?: { id: string; email: string; role: UserRole }` to `Request`.
3. `middleware/requireRole.ts`: `requireRole('INSTRUCTOR')` or `requireRole('ADMIN', 'INSTRUCTOR')`. It reads `req.user.role` and throws `forbidden()` if it is not in the list.
4. Add `authenticate` to `/auth/me` and `/auth/logout`'s sibling routes that need it, and use `authenticate, requireRole(...)` on every route from step 7 on.

Rules:

- A logged-out caller → `401`. A logged-in caller with the wrong role → `403`. Never `404` and never `500` for these.
- One database read per request is the price of "a demoted admin loses power at once". It is worth it.
- Add a short comment at the top of every router file listing who may call each route. It helps reviewers.

Tests (the required story 1.5 test is here): a student calling `POST /api/courses` → `403`; no cookie → `401`; a token for a user who was soft-deleted → `401`; an admin demoted in the DB, with a still-valid token, is blocked at once; a student **cannot edit another person's course** (add this test in step 9 once the route exists).

Done when: the middleware tests pass and the demo "student with a token gets 403 from the terminal" works.

### Step 7. `POST /api/courses` (story 1.6)

Who: instructor (and admin, since admins may manage courses). Success: `201` with the `Course` object.

Build:

1. Schema `createCourseSchema`:
   - `title`: trimmed, 3 to 120 chars.
   - `summary`: trimmed, 1 to 300 chars.
   - `description`: optional string.
   - `level`: `BEGINNER | INTERMEDIATE | ADVANCED`.
   - `thumbnailUrl`: optional, must be an `http(s)` URL, or `null`.
   - Use `.strict()` so extra keys such as `instructorId`, `status` or `slug` are rejected, not ignored.
2. Service `createCourse(user, input)`:
   1. `instructorId = user.id`. **Never** from the body.
   2. `status = DRAFT`.
   3. `slug = await uniqueSlug(title)`:
      - `base = slugify(title)`.
      - Read every existing slug that equals `base` or starts with `base-` (**include soft-deleted courses**, because the unique index covers them).
      - Use `base` if free, else `base-2`, `base-3`, and so on.
      - If `create` still fails with `P2002` on `slug` (a race), retry with the next number, up to 3 times.
3. Return `toCourse(row)` with the instructor summary included.

Errors: `400`, `401`, `403`.

Tests: new course is `DRAFT`; the instructor id is the caller's even if the body tries to send another one (the strict schema gives `400`); same title twice → `intro-to-react` then `intro-to-react-2`, then `-3`; a soft-deleted course still reserves its slug; title of 2 or 121 chars → `400`; summary of 301 chars → `400`.

Done when: story 1.6 API boxes are checked.

### Step 8. `GET /api/instructor/courses` (story 1.7)

Who: instructor. Success: `200` with the list envelope.

Build:

1. Query schema: `status` (`DRAFT | PUBLISHED | ARCHIVED`, optional), `page`, `pageSize`.
2. Service: `where: { instructorId: user.id, deletedAt: null, status? }`, `orderBy: { updatedAt: 'desc' }`, plus `count` in one `$transaction`.
3. `lib/pagination.ts`: `parsePage(query)`, `toMeta(total, page, pageSize)`, so steps 8, 11 and 12 share one shape.

Rules: it only ever returns the caller's courses, drafts included. An admin calling it sees their **own** courses too (it is "my courses").

Tests: instructor A never sees B's courses; drafts are included; soft-deleted courses are not; sort order is newest update first; `?status=DRAFT` filters; a student → `403`.

Done when: story 1.7 API boxes are checked.

**Contract gap to settle now:** the edit page (story 1.8, "edit form loads current values") has no way to fetch **one course by id**, because `GET /api/courses/:slug` is public and only returns published courses.
Proposal: add `GET /api/instructor/courses/:id` (owner or admin, drafts included, `403` for others, `404` if missing or deleted).
Agree this with your mentor, then add it to `api.md` in the same pull request.

### Step 9. `PATCH` and `DELETE /api/courses/:id` (story 1.8)

Who: owner or admin. Update → `200`. Delete → `204`.

Build:

1. A helper in the courses service: `getManageableCourse(user, id)`:
   1. Find the course where `deletedAt` is null. None → `404`.
   2. If `user.role !== 'ADMIN'` and `course.instructorId !== user.id` → `403`.
   3. Return the row.
      Every write route starts with this helper. This is the one place that answers "does this user own this course?" (a review question).
2. `PATCH` schema: all create fields optional, still `.strict()`, and at least one field required. Never accept `status`, `slug`, `instructorId` or `publishedAt`.
3. **The slug never changes after the first publish.** Even simpler and safer: do not regenerate the slug on any title change. The slug is made once at creation. Explain in the PR why breaking a live URL is bad (old links, bookmarks and search results stop working).
4. `DELETE` sets `deletedAt = now()` (soft delete). Courses are never removed with `DELETE FROM`.

Rules and cascade (our version of the reference's cascade list):

- Deleting a course: set `deletedAt`. Its modules and lessons stay (they are only hard-deleted if a developer hard-deletes the course, then the foreign-key cascade removes them).
- Enrollments are untouched, so student history survives.
- Every read query adds `deletedAt: null`. A direct URL to a deleted course → `404`.

Errors: `400` (bad id or body), `401`, `403`, `404`.

Tests: owner can patch and delete; another instructor → `403`; **a student cannot edit another person's course** (required by story 1.5); admin can edit any; deleted course → `404` on later patch; title change leaves the slug alone; `{ "status": "PUBLISHED" }` in a PATCH body → `400`.

Done when: story 1.8 API boxes are checked.

### Step 10. Publish, unpublish, archive (story 1.9)

Who: owner or admin. Success: `200` with the `Course` object.

Allowed moves:

| From        | `publish`                           | `unpublish` | `archive`    |
| ----------- | ----------------------------------- | ----------- | ------------ |
| `DRAFT`     | → `PUBLISHED` (after the check)     | no-op `200` | → `ARCHIVED` |
| `PUBLISHED` | no-op `200`                         | → `DRAFT`   | → `ARCHIVED` |
| `ARCHIVED`  | `409` "Move it back to draft first" | → `DRAFT`   | no-op `200`  |

Two things in this table are my reading of the spec: archiving straight from `DRAFT`, and "same state again" being a harmless `200`. Confirm both with your mentor.

Build:

1. One small function in the service: `transition(user, id, action)`, with the table above as data (a `Record`), so there is no pile of `if` statements.
2. **Publish check:** `title`, `summary` and `description` must all be non-empty after trim. If not, `400 VALIDATION_ERROR` with one `details` entry per missing field, for example `{ path: 'description', message: 'Required to publish' }`.
3. On publish: `status = PUBLISHED`, and set `publishedAt = now()` **only if it is null**. It is set once, on first publish.
4. On unpublish and archive: change `status` only. `publishedAt` stays as it was.
5. Use `updateMany ... where id and status = <expected from-state>` or a transaction, so two clicks cannot both succeed in a confusing way.

Rules: all three go through `getManageableCourse` first (owner or admin).

Errors: `400` (incomplete course), `403`, `404`, `409` (illegal move).

Tests: incomplete course → `400` with each missing field named; publish sets `publishedAt` once; publish → unpublish → publish keeps the **first** `publishedAt`; unpublish keeps `publishedAt`; archived → publish is `409`; archived → unpublish is `DRAFT`; another instructor → `403`.

Done when: story 1.9 API boxes are checked.

### Step 11. Catalog and course detail (stories 1.10 and 1.11)

**List.** `GET /api/courses`, public, `200` with the list envelope.

Build:

1. Query schema: `q` (trimmed, max 100), `level` (optional enum), `page` (default 1), `pageSize` (default **12**, max 50).
2. Service:
   - `where`: `status = PUBLISHED`, `deletedAt = null`, plus `level` if given, plus (if `q`) `OR [ title contains q, summary contains q ]` with `mode: 'insensitive'`.
   - `orderBy: { publishedAt: 'desc' }`.
   - `include: { instructor: { select: { id, fullName, avatarUrl } } }`. Select only those three fields.
   - Run `count` and `findMany` in one `$transaction`.
3. `toCourseSummary(row)` for each item.

**Detail.** `GET /api/courses/:slug`, public, `200` or `404`.

1. Find by `slug` where `status = PUBLISHED` and `deletedAt = null`.
2. Draft, archived and deleted all look the same: `404`. A draft stays invisible **even if you know its URL**.
3. Return `toCourse(row)`. The "Edit" button logic is web-side (compare ids); the API does not send it.

Rules and notes:

- Public routes still validate input. `?page=abc` → `400`, not a crash.
- The `contains ... insensitive` search runs `ILIKE '%q%'`, which cannot use a normal index. That is the **slowest query on the catalog page** (a Foundations review question). A trigram index (`pg_trgm`) is the fix when the table grows. Write it down in `docs/decisions/`; do not add it yet.
- Archived courses are hidden from the catalog and from `/:slug`. When enrollment arrives in the next milestone, students already enrolled will need another way to open them. Note it for Phase 2.

Errors: `400` (bad query), `404`.

Tests: only published, non-deleted courses appear; a draft is missing from the list **and** `404` by slug; seeded data gives 12 on page 1 and the rest on page 2, with correct `meta`; `q` matches title and summary, any letter case; `level` filter works; `q` with `%` or `_` does not act as a wildcard (Prisma escapes it; keep one test); instructor object has exactly `id`, `fullName`, `avatarUrl`; unknown slug → `404`.

Done when: story 1.10 and 1.11 API boxes are checked.

### Step 12. Admin user management (story 1.12)

Who: `ADMIN` only (`authenticate, requireRole('ADMIN')` once, at the router level).

**`GET /api/admin/users`** → `200`, list envelope.

1. Query: `q` (name or email, case-insensitive), `role` (optional), `page`, `pageSize`.
2. `where deletedAt = null`, newest first. Return `toUser` objects. Fields: name, email, role, join date (`createdAt`).

**`PATCH /api/admin/users/:id/role`** → `200` with the `User`.

1. Body `{ role }` (`STUDENT | INSTRUCTOR | ADMIN`), strict.
2. If `:id` is the caller's own id → `403 FORBIDDEN` "You cannot change your own role". (Spec says it is blocked; it does not give a code. `403` is my pick. Confirm.)
3. Unknown or deleted user → `404`.
4. The change takes effect at once because step 6 reads the role from the database. Add a test that proves it.

**`DELETE /api/admin/users/:id`** → `204`.

1. Unknown or already-deleted → `404`. Own id → `403` (an admin cannot delete themselves).
2. Count the user's courses where `status = PUBLISHED` and `deletedAt = null`. If more than 0 → `409 CONFLICT` with a message that includes the number, for example "This instructor owns 3 published courses. Unpublish or reassign them first."
3. Otherwise, in one transaction: set `deletedAt = now()` **and** revoke all the user's refresh tokens (`updateMany` set `revokedAt`).
4. After that the user cannot log in (step 3) and any live access token stops working within the same request (step 6).

Reference habit applied (cascade rules, written out):

- User deleted → the user row is soft-deleted, their sessions are revoked. Their draft and archived courses stay, still pointing at that user. Their enrollments stay.
- No hard cascade happens. The reference assignment nulls `authorId` and deletes comments because it hard-deletes; we keep history instead.

Open question for the mentor: should demoting an instructor who still has published courses also be blocked? The spec says nothing. The safe default is "allow it and leave the courses alone".

Errors: `400`, `401`, `403` (non-admin, or self-action), `404`, `409`.

Tests: student and instructor → `403`; list shows no deleted users; search by name and by email; role change works and a demoted admin is blocked on the next call; admin changing own role → `403`; deleting an instructor with published courses → `409` and the message has the count; deleting one with only drafts → `204`, then login fails and the old token → `401`.

Done when: story 1.12 API boxes are checked.

### Step 13. Seed script and `docs/api.md` (story 1.13)

The first seed version is done (1 admin, 3 instructors, 10 students, 20 courses).
Finish it:

1. Run it twice in a row: it must not crash and must not create duplicates (it wipes first, so it should be safe; prove it).
2. Check it refuses to run with `NODE_ENV=production`.
3. Make sure the README lists the dev password and example accounts.
4. Keep the seed in step with the API: after step 11 it must give more than one catalog page (14 published courses).
5. Update `docs/api.md` in the same pull request as each endpoint: change ⏳ to ✅, add example request and response, and list every error the endpoint can return.

### Step 14. Hardening and the final check

Before the Foundations review, go through this list.

**Security**

- [ ] Search the repo: `passwordHash` appears only in the auth service, the seed and the Prisma schema. No mapper copies it.
- [ ] Every protected endpoint has `authenticate`, and a role check or an ownership check.
- [ ] `instructorId` never comes from a request body.
- [ ] Passwords are not in any log line (check with `LOG_LEVEL=debug`).
- [ ] No stack trace or SQL text reaches a response (`500` says only "Something went wrong on our side").
- [ ] `.env` is not committed. `.env.example` has `JWT_ACCESS_SECRET` with a comment.

**Behaviour**

- [ ] Bad input gives `400`, never a crash: try malformed JSON, a missing body, a non-UUID id, a huge string, `page=-1`.
- [ ] Every list has the same envelope.
- [ ] A draft is invisible in the catalog and by slug.
- [ ] Soft-deleted users cannot log in, refresh or use an old token.

**Process**

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass from a fresh clone.
- [ ] `docs/api.md` matches the code.
- [ ] Each choice you made on a gap has ten lines in `docs/decisions/` (rate limiter in memory, `jose`, single-resource shape, state machine table, self-role rule, slug stability).

**Stretch idea (only with your mentor's nod):** serve OpenAPI docs at `/doc` like the reference does.
The cheap way is to describe the same Zod schemas with `zod-openapi` and serve them with `swagger-ui-express`.
That is two new dependencies, so it needs a reason you can say out loud.

---

## 5. Status code cheat sheet

| Endpoint                      | Success | Errors                            |
| ----------------------------- | ------- | --------------------------------- |
| `POST /auth/register`         | `201`   | `400`, `409`                      |
| `POST /auth/login`            | `200`   | `400`, `401`, `429`               |
| `POST /auth/refresh`          | `200`   | `401`                             |
| `POST /auth/logout`           | `204`   | none                              |
| `GET /auth/me`                | `200`   | `401`                             |
| `GET /courses`                | `200`   | `400`                             |
| `GET /courses/:slug`          | `200`   | `404`                             |
| `POST /courses`               | `201`   | `400`, `401`, `403`               |
| `GET /instructor/courses`     | `200`   | `400`, `401`, `403`               |
| `PATCH /courses/:id`          | `200`   | `400`, `401`, `403`, `404`        |
| `DELETE /courses/:id`         | `204`   | `400`, `401`, `403`, `404`        |
| `POST /courses/:id/publish`   | `200`   | `400`, `401`, `403`, `404`, `409` |
| `POST /courses/:id/unpublish` | `200`   | `401`, `403`, `404`               |
| `POST /courses/:id/archive`   | `200`   | `401`, `403`, `404`               |
| `GET /admin/users`            | `200`   | `400`, `401`, `403`               |
| `PATCH /admin/users/:id/role` | `200`   | `400`, `401`, `403`, `404`        |
| `DELETE /admin/users/:id`     | `204`   | `401`, `403`, `404`, `409`        |
| `GET /health`                 | `200`   | `503`                             |

`400` always means bad input.
`401` means "we do not know who you are".
`403` means "we know you, and you may not".
`404` means "not there" (or hidden, like a draft).
`409` means "the request is fine but the current state blocks it".

---

## 6. Open questions for your mentor

1. Add `GET /api/instructor/courses/:id` so the edit page can load a course (step 8)?
2. Single resources returned as the bare object, not `{ data: ... }` (section 2.4)?
3. Which status for "admin changes own role": `403` (my pick) or `409` (step 12)?
4. May a `DRAFT` course be archived directly, and is "same state again" a harmless `200` (step 10)?
5. Should a soft-deleted user's email be usable again (step 2)? A partial unique index (`WHERE deleted_at IS NULL`) would allow it.
6. Block demoting an instructor who owns published courses (step 12)?
7. In-memory login limiter is fine for one instance. OK for now (step 3)?
