# API contract

The contract comes first; the code follows it. **Update this file in the same PR that changes an endpoint.**

Base path: `/api`. In development the API runs on `http://localhost:4000`; the web app on `:3000` forwards `/api/*` to it.

## Conventions (hold for the whole project)

- **Slug for public reads, id for everything else.** Never mix them on one route.
- **No fixed word where an id or slug goes.** `GET /api/courses/mine` collides with a course titled "Mine". Instructor-scoped routes live under `/api/instructor/...`.
- **Every list endpoint returns the same envelope:** `{ data: [...], meta: { page, pageSize, total, totalPages } }`.
- **Every error has the same shape:**

  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Some fields are invalid",
      "details": [{ "path": "email", "message": "Invalid email" }]
    }
  }
  ```

  `details` is always present (an empty array when there is nothing field-specific).

- Timestamps are ISO-8601, UTC.
- Types for all of the above live in `packages/shared` (`ApiErrorBody`, `Paginated<T>`, ...).

### Status codes

| Code      | Meaning                                       | `error.code`                                                                    |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| 200 / 201 | OK / created                                  | —                                                                               |
| 400       | Bad input                                     | `VALIDATION_ERROR` (per-field `details`) or `BAD_REQUEST` (e.g. malformed JSON) |
| 401       | Not logged in                                 | `UNAUTHENTICATED`                                                               |
| 403       | Logged in, not allowed                        | `FORBIDDEN`                                                                     |
| 404       | Missing (also: a draft someone else asks for) | `NOT_FOUND`                                                                     |
| 409       | Conflict                                      | `CONFLICT`                                                                      |
| 429       | Too many attempts                             | `RATE_LIMITED`                                                                  |
| 500       | Our bug                                       | `INTERNAL_ERROR` (message never leaks the cause)                                |

Every response carries an `x-request-id` header; the same id is in the server log line for that request.

## Endpoints

Status: ✅ built · ⏳ planned (Block B / C of Foundations)

| Status | Method   | Path                         | Who            | Does                                                                 |
| :----: | -------- | ---------------------------- | -------------- | -------------------------------------------------------------------- |
|   ✅   | `GET`    | `/api/health`                | public         | Uptime and DB check. `200` healthy, `503` if Postgres is unreachable |
|   ⏳   | `POST`   | `/api/auth/register`         | public         | Create account, log in                                               |
|   ⏳   | `POST`   | `/api/auth/login`            | public         | Log in                                                               |
|   ⏳   | `POST`   | `/api/auth/refresh`          | cookie         | Rotate tokens                                                        |
|   ⏳   | `POST`   | `/api/auth/logout`           | any user       | Revoke and clear                                                     |
|   ⏳   | `GET`    | `/api/auth/me`               | any user       | Current user                                                         |
|   ⏳   | `GET`    | `/api/courses`               | public         | Published catalog, paged and filtered                                |
|   ⏳   | `GET`    | `/api/courses/:slug`         | public         | One published course                                                 |
|   ⏳   | `POST`   | `/api/courses`               | instructor     | Create draft                                                         |
|   ⏳   | `GET`    | `/api/instructor/courses`    | instructor     | Own courses, drafts included                                         |
|   ⏳   | `PATCH`  | `/api/courses/:id`           | owner or admin | Update                                                               |
|   ⏳   | `DELETE` | `/api/courses/:id`           | owner or admin | Soft delete                                                          |
|   ⏳   | `POST`   | `/api/courses/:id/publish`   | owner or admin | Publish                                                              |
|   ⏳   | `POST`   | `/api/courses/:id/unpublish` | owner or admin | Back to draft                                                        |
|   ⏳   | `POST`   | `/api/courses/:id/archive`   | owner or admin | Archive                                                              |
|   ⏳   | `GET`    | `/api/admin/users`           | admin          | List and search users                                                |
|   ⏳   | `PATCH`  | `/api/admin/users/:id/role`  | admin          | Change role                                                          |
|   ⏳   | `DELETE` | `/api/admin/users/:id`       | admin          | Soft delete user                                                     |

### `GET /api/health`

```json
{ "status": "ok", "db": "up", "uptimeSeconds": 42, "timestamp": "2026-10-13T18:00:00.000Z" }
```

When the database is unreachable: HTTP `503` with `"status": "degraded", "db": "down"`.
