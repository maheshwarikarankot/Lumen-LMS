import { describe, expect, it } from 'vitest';
import { BCRYPT_COST, DUMMY_HASH, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes with bcrypt at cost 12, never storing the plain text', async () => {
    const hashed = await hashPassword('Correct horse 1');

    expect(hashed).toMatch(/^\$2[aby]\$12\$/);
    expect(hashed).not.toContain('Correct horse 1');
    expect(BCRYPT_COST).toBe(12);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hashed = await hashPassword('Correct horse 1');

    expect(await verifyPassword('Correct horse 1', hashed)).toBe(true);
    expect(await verifyPassword('correct horse 1', hashed)).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('Same password 1'),
      hashPassword('Same password 1'),
    ]);
    expect(a).not.toBe(b);
  });

  it('has a dummy hash that is a real cost-12 hash and matches nobody', async () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('Password123!', DUMMY_HASH)).toBe(false);
  });
});
