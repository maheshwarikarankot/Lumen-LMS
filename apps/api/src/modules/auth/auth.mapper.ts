import type { User } from '@lumen/shared';
import type { User as UserRow } from '../../generated/prisma/client.js';

/**
 * Database row -> what the API sends back.
 *
 * Every field is copied by name on purpose. A column added to the schema later cannot leak into
 * a response until someone adds a line here — which is why `passwordHash` and `deletedAt` are
 * not an accident waiting to happen.
 */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt.toISOString(),
  };
}
