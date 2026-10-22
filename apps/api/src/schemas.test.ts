import {
  idParam,
  isUserRole,
  loginSchema,
  pageQuery,
  registerSchema,
  slugParam,
} from '@lumen/shared';
import { describe, expect, it } from 'vitest';

describe('shared request schemas', () => {
  it('idParam accepts a UUID and rejects anything else', () => {
    expect(idParam.safeParse({ id: '0b8f3a53-7d0a-4a41-9e7c-5a1a3f1f6b11' }).success).toBe(true);
    expect(idParam.safeParse({ id: '123' }).success).toBe(false);
    expect(idParam.safeParse({ id: 'mine' }).success).toBe(false);
    expect(idParam.safeParse({}).success).toBe(false);
  });

  it('slugParam accepts slugify() output and rejects the rest', () => {
    expect(slugParam.safeParse({ slug: 'intro-to-react-2' }).success).toBe(true);
    expect(slugParam.safeParse({ slug: 'Intro To React' }).success).toBe(false);
    expect(slugParam.safeParse({ slug: '-leading' }).success).toBe(false);
    expect(slugParam.safeParse({ slug: 'a'.repeat(161) }).success).toBe(false);
  });

  it('pageQuery turns text into numbers and applies defaults', () => {
    expect(pageQuery.parse({})).toEqual({ page: 1, pageSize: 12 });
    expect(pageQuery.parse({ page: '3', pageSize: '20' })).toEqual({ page: 3, pageSize: 20 });
  });

  it('pageQuery rejects nonsense', () => {
    expect(pageQuery.safeParse({ page: '0' }).success).toBe(false);
    expect(pageQuery.safeParse({ page: '-1' }).success).toBe(false);
    expect(pageQuery.safeParse({ page: 'abc' }).success).toBe(false);
    expect(pageQuery.safeParse({ pageSize: '51' }).success).toBe(false);
  });

  it('isUserRole narrows only the three real roles', () => {
    expect(isUserRole('ADMIN')).toBe(true);
    expect(isUserRole('admin')).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });
});

describe('register schema', () => {
  const valid = {
    fullName: 'Priya Raman',
    email: 'priya@lumen.test',
    password: 'Password123',
    role: 'INSTRUCTOR',
  };

  it('accepts a good registration', () => {
    expect(registerSchema.parse(valid)).toEqual(valid);
  });

  it('trims the name and lowercases the email', () => {
    const parsed = registerSchema.parse({
      ...valid,
      fullName: '  Priya Raman ',
      email: ' Priya@Lumen.TEST ',
    });

    expect(parsed.fullName).toBe('Priya Raman');
    expect(parsed.email).toBe('priya@lumen.test');
  });

  it('refuses to create an admin', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });

  it('wants eight characters, a letter and a number', () => {
    const message = (password: string) =>
      registerSchema.safeParse({ ...valid, password }).error?.issues.map((i) => i.message) ?? [];

    expect(message('Pass1')).toContain('Use at least 8 characters');
    expect(message('password')).toContain('Include at least one number');
    expect(message('12345678')).toContain('Include at least one letter');
    expect(registerSchema.safeParse({ ...valid, password: 'Password123' }).success).toBe(true);
  });

  it('stops at the 72-character limit bcrypt imposes', () => {
    expect(registerSchema.safeParse({ ...valid, password: `a1${'x'.repeat(71)}` }).success).toBe(
      false,
    );
  });

  it('rejects a malformed email and an empty name', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'priya-at-lumen' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, fullName: '   ' }).success).toBe(false);
  });

  it('rejects an unexpected field instead of ignoring it', () => {
    const result = registerSchema.safeParse({
      ...valid,
      id: 'fdf0a4e7-6a7d-4a74-9a1e-1f3c2b4d5e6f',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe('unrecognized_keys');
  });
});

describe('login schema', () => {
  it('normalises the email but does not judge its shape', () => {
    // A malformed address must fail the same way a wrong password does — at 401, not 400.
    expect(loginSchema.parse({ email: ' Priya@Lumen.TEST ', password: 'x' }).email).toBe(
      'priya@lumen.test',
    );
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(true);
  });

  it('needs both fields', () => {
    expect(loginSchema.safeParse({ email: '', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
