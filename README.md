# Lumen LMS

A small learning management system. Instructors create courses, students enroll and learn, admins manage people.

**Stack:** Next.js (App Router) + Tailwind · Express · PostgreSQL + Prisma · TypeScript (strict) · pnpm workspaces

> New machine? Do [`SETUP.md`](./SETUP.md) first (Node 24 via nvm, pnpm, Docker Desktop, Git over SSH).

## Start everything in four commands

From the repo root:

```bash
nvm use && pnpm install                     # Node 24, then all workspaces
cp .env.example .env && docker compose up -d --wait   # config + Postgres (waits until healthy)
pnpm db:migrate && pnpm db:seed             # create tables, add demo data
pnpm dev                                    # web + api, with hot reload
```

Then open:

| What       | URL                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------- |
| Web app    | http://localhost:3000                                                                         |
| API health | http://localhost:4000/api/health (also at http://localhost:3000/api/health through the proxy) |
| Postgres   | `localhost:5437` (user, password and database are in your `.env`)                             |

`pnpm install`, `pnpm`, never `npm install` — mixing them creates a second lockfile.

## Demo accounts

`pnpm db:seed` wipes the database and creates 1 admin, 3 instructors, 10 students and 20 courses.
Every seeded account has the same password:

```
Password123!
```

| Role       | Email                                         |
| ---------- | --------------------------------------------- |
| Admin      | `dana@lumen.test`                             |
| Instructor | `priya@lumen.test` (also `marcus@`, `elena@`) |
| Student    | `sam@lumen.test` (also `aisha@`, `diego@`, …) |

The seed refuses to run when `NODE_ENV=production`.

## Commands

Every command runs from the repo root.

| Command                              | What it does                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                           | Builds `@lumen/shared`, then runs shared (watch), API (`:4000`) and web (`:3000`)        |
| `pnpm build`                         | Production build of every package                                                        |
| `pnpm test`                          | All API tests. The integration tests need Docker running (`docker compose up -d --wait`) |
| `pnpm --filter @lumen/api test:unit` | Fast tests only. No Docker needed                                                        |
| `pnpm --filter @lumen/api test:int`  | Integration tests only, against the `lumen_test` database                                |
| `pnpm typecheck`                     | `tsc` in strict mode, everywhere                                                         |
| `pnpm lint` / `pnpm lint:fix`        | ESLint                                                                                   |
| `pnpm format` / `pnpm format:check`  | Prettier                                                                                 |
| `pnpm db:migrate`                    | `prisma migrate dev` — apply and create migrations (`pnpm db:migrate --name add_thing`)  |
| `pnpm db:seed`                       | Wipe and reseed the dev database                                                         |
| `pnpm db:studio`                     | Browse the data in Prisma Studio                                                         |
| `pnpm db:generate`                   | Regenerate the Prisma client (the API's `dev` script does this for you)                  |

Reset the database completely:

```bash
docker compose down -v && docker compose up -d --wait && pnpm db:migrate && pnpm db:seed
```

## Layout

```
apps/web         Next.js app (the UI). Never talks to the database.
apps/api         Express API. The only thing that talks to the database.
  prisma/          schema.prisma, migrations, seed.ts
packages/shared  TypeScript types shared by web and api
docs/            api.md (the contract), decisions/ (why we chose things), data model / ERD
```

## Environment

All variables live in one root `.env` (copied from `.env.example`, which is the full list). It is git-ignored: never commit it. If you add a variable, add it to `.env.example` with a comment and tell the team.

## Conventions

- `main` always works; changes arrive through reviewed pull requests of ~400 lines or fewer.
- One error shape, one list envelope — see [`docs/api.md`](./docs/api.md).
- Validate every request body with Zod at the edge; handlers only see parsed input.
- Rename files with `git mv` (macOS and Windows ignore case; Linux CI does not).
- A real decision gets ten lines in [`docs/decisions/`](./docs/decisions).

## Troubleshooting

| Symptom                                         | Likely cause                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `Can't reach database server at localhost:5437` | Docker Desktop not running, or `docker compose ps` shows Postgres not healthy   |
| `Invalid environment configuration` on start    | No `.env` — run `cp .env.example .env`                                          |
| Web shows "API unreachable"                     | API not running, or `API_URL` is wrong                                          |
| `Cannot find module '@lumen/shared'`            | Shared not built yet — `pnpm --filter @lumen/shared build` (`pnpm dev` does it) |
| Prisma: `Could not find a schema.prisma`        | You ran `prisma` from the repo root — use the `pnpm db:*` scripts               |
