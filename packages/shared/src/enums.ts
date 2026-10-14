// Values mirror the Postgres enums in apps/api/prisma/schema.prisma.

export const USER_ROLES = ['STUDENT', 'INSTRUCTOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const ENROLLMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'DROPPED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
