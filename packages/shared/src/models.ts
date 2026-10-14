import type { CourseLevel, CourseStatus, UserRole } from './enums.js';

// What the API sends over the wire. Dates are ISO-8601 strings in UTC.
// Note what is NOT here: passwordHash and deletedAt never leave the API.

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
}

/** The slice of a user that is safe to show next to a course. */
export interface InstructorSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

/** A course as shown on a catalog card. */
export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  thumbnailUrl: string | null;
  level: CourseLevel;
  status: CourseStatus;
  instructor: InstructorSummary;
  publishedAt: string | null;
  updatedAt: string;
}

/** A course with its long-form body, for the detail and edit pages. */
export interface Course extends CourseSummary {
  description: string | null;
  createdAt: string;
}
