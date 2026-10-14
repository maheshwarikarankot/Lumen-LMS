import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createCourse, createUser, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('test database', () => {
  it('creates a user and reads it back', async () => {
    const { user, password } = await createUser({ email: 'priya@lumen.test', role: 'INSTRUCTOR' });

    const found = await prisma.user.findUnique({ where: { email: 'priya@lumen.test' } });

    expect(found?.id).toBe(user.id);
    expect(found?.role).toBe('INSTRUCTOR');
    expect(found?.deletedAt).toBeNull();
    expect(found?.passwordHash).not.toBe(password); // stored hashed, never plain
  });

  it('starts every test with empty tables', async () => {
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.course.count()).toBe(0);
  });
});

// These prove the hand-written parts of the first migration really exist in Postgres.
describe('migration rules', () => {
  it('rejects an email that is not lowercase', async () => {
    await expect(createUser({ email: 'Mixed@Lumen.test' })).rejects.toThrow();
  });

  it('rejects a duplicate email', async () => {
    await createUser({ email: 'same@lumen.test' });
    await expect(createUser({ email: 'same@lumen.test' })).rejects.toThrow();
  });

  it('rejects a course title shorter than 3 characters', async () => {
    const { user } = await createUser({ role: 'INSTRUCTOR' });
    await expect(createCourse(user.id, { title: 'ab' })).rejects.toThrow();
  });

  it('rejects a summary longer than 300 characters', async () => {
    const { user } = await createUser({ role: 'INSTRUCTOR' });
    await expect(createCourse(user.id, { summary: 'x'.repeat(301) })).rejects.toThrow();
  });

  it('rejects a duplicate course slug', async () => {
    const { user } = await createUser({ role: 'INSTRUCTOR' });
    await createCourse(user.id, { slug: 'intro-to-react' });
    await expect(createCourse(user.id, { slug: 'intro-to-react' })).rejects.toThrow();
  });

  it('allows one enrollment per student per course, and no more', async () => {
    const { user: instructor } = await createUser({ role: 'INSTRUCTOR' });
    const { user: student } = await createUser();
    const course = await createCourse(instructor.id);

    const data = { courseId: course.id, studentId: student.id };
    await prisma.enrollment.create({ data });

    await expect(prisma.enrollment.create({ data })).rejects.toThrow();
  });

  it('does not delete a user who still owns a course (soft delete only)', async () => {
    const { user } = await createUser({ role: 'INSTRUCTOR' });
    await createCourse(user.id);

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
  });

  describe('module positions are deferrable', () => {
    async function twoModules() {
      const { user } = await createUser({ role: 'INSTRUCTOR' });
      const course = await createCourse(user.id);
      const a = await prisma.module.create({
        data: { courseId: course.id, title: 'A', position: 1 },
      });
      const b = await prisma.module.create({
        data: { courseId: course.id, title: 'B', position: 2 },
      });
      return { course, a, b };
    }

    it('lets two modules swap places inside one transaction', async () => {
      const { a, b } = await twoModules();

      await prisma.$transaction(async (tx) => {
        await tx.module.update({ where: { id: a.id }, data: { position: 2 } }); // collides, for now
        await tx.module.update({ where: { id: b.id }, data: { position: 1 } }); // …and is fixed here
      });

      const after = await prisma.module.findMany({ orderBy: { position: 'asc' } });
      expect(after.map((m) => m.title)).toEqual(['B', 'A']);
    });

    it('still rejects a real duplicate when the transaction commits', async () => {
      const { course } = await twoModules();

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.module.create({ data: { courseId: course.id, title: 'C', position: 1 } });
        }),
      ).rejects.toThrow();
    });
  });
});
