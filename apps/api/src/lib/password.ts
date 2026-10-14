import { compare, hash } from 'bcryptjs';

/** bcrypt work factor. Raising it later is safe: old hashes keep working. */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

/**
 * A real cost-12 hash of a password nobody knows. When a login names an email that does not
 * exist, compare against this anyway, so "unknown email" takes as long as "wrong password"
 * and response time does not reveal which emails have accounts.
 */
export const DUMMY_HASH = '$2b$12$zDCTdXS9q7j6U7DAmYZGi.n7PK3SR1JKfv0yiCFQ/Y7ONjWk1aLpK';
