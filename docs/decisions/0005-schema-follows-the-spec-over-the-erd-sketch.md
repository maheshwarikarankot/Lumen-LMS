# 0005 — Where the ERD sketch and the spec disagree, the spec wins

**Context.** `docs/Lumen LMS data model.txt` (the ERD) was drawn quickly and differs from the data model in PHASE-1.

**Decision.** The Prisma schema follows PHASE-1. The differences, to be confirmed at the schema review:

| ERD sketch                                                                | Schema                                                      | Why                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `enrollments.status`: active / completed / **cancelled**                  | `ACTIVE` / `COMPLETED` / **`DROPPED`**                      | PHASE-1 and the `dropped_at` column both say "dropped"; "cancelled" has no matching timestamp |
| `status` listed twice on `enrollments`                                    | once                                                        | typo                                                                                          |
| relation lines say `enrollments.userId`, `modules.courseId`, `courses_id` | `student_id`, `course_id`                                   | one naming scheme; `userId` would hide that this is the _student_                             |
| `instructorId`, `thumbnail_Url`, `avatar_Url`, `video_Url`                | `instructor_id`, `thumbnail_url`, `avatar_url`, `video_url` | all columns snake_case                                                                        |
| `courses.description` as plain text                                       | nullable text                                               | a draft may have none; publishing requires it                                                 |

**Consequence.** The ERD files should be updated to match before the review.
