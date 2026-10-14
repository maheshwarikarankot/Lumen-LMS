import { z } from 'zod';

// Building blocks for request validation. The API validates with these on the server;
// the web forms can reuse the same rules on the client.

/** `/something/:id` — the id must be a UUID, otherwise 400 (never a database error). */
export const idParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof idParam>;

/** `/courses/:slug` — lowercase words joined by hyphens, as produced by slugify(). */
export const slugParam = z.object({
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug'),
});
export type SlugParam = z.infer<typeof slugParam>;

/** `?page=2&pageSize=12`. Query strings are text, so numbers are coerced. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type PageQuery = z.infer<typeof pageQuery>;
