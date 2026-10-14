import { idParam, isUserRole, pageQuery, slugParam } from '@lumen/shared';
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
