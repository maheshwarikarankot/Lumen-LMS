import { z } from 'zod';

// Request shapes for /api/auth/*. The API validates with these; the web forms reuse them,
// so a rule can never drift between the two.

/**
 * Who may be created through the public form. ADMIN is deliberately missing: admins come from
 * the seed or are promoted by another admin (story 1.1).
 */
export const REGISTERABLE_ROLES = ['STUDENT', 'INSTRUCTOR'] as const;
export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number];

/** Trimmed and lowercased before it is checked, so "Priya@Lumen.TEST" is one account, not two. */
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

/**
 * At least 8 characters, with a letter and a number (story 1.1).
 * The upper bound is bcrypt's: it ignores everything past 72 bytes, so a longer password
 * would only be partly checked. Saying no beats pretending.
 */
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

/** `.strict()` everywhere: an unexpected field is a bug or an attack, never something to ignore. */
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter your name').max(100, 'Use at most 100 characters'),
    email,
    password,
    role: z.enum(REGISTERABLE_ROLES, { error: 'Choose either Student or Instructor' }),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login checks that the email is present, not that it looks like an email. A malformed address
 * and a wrong password should be indistinguishable to someone hunting for real accounts.
 */
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1, 'Enter your email'),
    password: z.string().min(1, 'Enter your password'),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;
