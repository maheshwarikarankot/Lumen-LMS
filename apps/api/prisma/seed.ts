// Wipes the database and fills it with believable demo data. Run: pnpm db:seed
// Safe to run repeatedly — it always starts by clearing everything.

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { env } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { CourseLevel, CourseStatus, UserRole } from '../src/generated/prisma/client.js';
import { slugify } from '../src/lib/slug.js';

// Checked before any connection is made.
if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production. This script deletes all data.');
  process.exit(1);
}

/** Every seeded account uses this password. It is also in the README. */
const DEV_PASSWORD = 'Password123!';
const BCRYPT_COST = 12;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

interface SeedUser {
  email: string;
  fullName: string;
  role: UserRole;
}

const admin: SeedUser = { email: 'dana@lumen.test', fullName: 'Dana Okafor', role: 'ADMIN' };

const instructors: SeedUser[] = [
  { email: 'priya@lumen.test', fullName: 'Priya Raman', role: 'INSTRUCTOR' },
  { email: 'marcus@lumen.test', fullName: 'Marcus Hale', role: 'INSTRUCTOR' },
  { email: 'elena@lumen.test', fullName: 'Elena Petrova', role: 'INSTRUCTOR' },
];

const students: SeedUser[] = [
  'Sam Carter',
  'Aisha Khan',
  'Diego Alvarez',
  'Mei Lin',
  'Tom Becker',
  'Zoe Adams',
  'Ravi Patel',
  'Lena Fischer',
  'Omar Haddad',
  'Chloe Martin',
].map((fullName) => ({
  email: `${fullName.split(' ')[0]?.toLowerCase()}@lumen.test`,
  fullName,
  role: 'STUDENT' as const,
}));

interface SeedCourse {
  title: string;
  summary: string;
  detail: string;
  level: CourseLevel;
  status: CourseStatus;
  /** Index into `instructors` */
  by: 0 | 1 | 2;
}

// 20 courses: 14 published (more than one catalog page of 12), 4 drafts, 2 archived.
// prettier-ignore
const courses: SeedCourse[] = [
  // Priya — front-end
  { by: 0, status: 'PUBLISHED', level: 'BEGINNER', title: 'Intro to React', summary: 'Build your first interactive web app and learn how React thinks about the screen.', detail: 'Components, props, state and events, one small project at a time.' },
  { by: 0, status: 'PUBLISHED', level: 'ADVANCED', title: 'Advanced TypeScript Patterns', summary: 'Generics, conditional types and the patterns that keep large codebases honest.', detail: 'You should already be comfortable with everyday TypeScript.' },
  { by: 0, status: 'PUBLISHED', level: 'INTERMEDIATE', title: 'Designing Accessible Interfaces', summary: 'Make what you build usable with a keyboard, a screen reader and a bad day.', detail: 'Semantics, focus, contrast, and how to test all three without special tools.' },
  { by: 0, status: 'PUBLISHED', level: 'BEGINNER', title: 'CSS Layout That Actually Works', summary: 'Flexbox and Grid without the guesswork, from a phone screen up.', detail: 'Every lesson ends with a layout you can inspect and break on purpose.' },
  { by: 0, status: 'PUBLISHED', level: 'INTERMEDIATE', title: 'Testing Frontends with Confidence', summary: 'Write tests that catch real bugs and survive the next refactor.', detail: 'Unit, component and end-to-end tests, and when each one earns its keep.' },
  { by: 0, status: 'DRAFT', level: 'INTERMEDIATE', title: 'State Management Without Tears', summary: 'Choose the smallest tool that solves your state problem.', detail: 'Work in progress.' },
  { by: 0, status: 'DRAFT', level: 'ADVANCED', title: 'Web Performance Playbook', summary: 'Measure first, then fix the three things that matter most.', detail: 'Work in progress.' },
  // Marcus — back-end
  { by: 1, status: 'PUBLISHED', level: 'BEGINNER', title: 'SQL for Absolute Beginners', summary: 'Ask questions of a database and get answers back. No prior experience needed.', detail: 'SELECT, JOIN, GROUP BY and the mistakes everyone makes with them.' },
  { by: 1, status: 'PUBLISHED', level: 'ADVANCED', title: 'PostgreSQL Indexing Deep Dive', summary: 'Read query plans, pick the right index, and stop guessing why a query is slow.', detail: 'B-trees, partial indexes, and what EXPLAIN is really telling you.' },
  { by: 1, status: 'PUBLISHED', level: 'INTERMEDIATE', title: 'Designing REST APIs', summary: 'Resources, status codes and error shapes that other developers will thank you for.', detail: 'Design the contract first, then build it.' },
  { by: 1, status: 'PUBLISHED', level: 'BEGINNER', title: 'Node.js From Zero', summary: 'Run JavaScript on a server and build a small API from scratch.', detail: 'Modules, the event loop, Express, and reading other people’s errors.' },
  { by: 1, status: 'PUBLISHED', level: 'INTERMEDIATE', title: 'Authentication Done Right', summary: 'Passwords, sessions and tokens, and the mistakes that get databases leaked.', detail: 'Hashing, refresh tokens, cookies, and threat-modelling your own login form.' },
  { by: 1, status: 'ARCHIVED', level: 'BEGINNER', title: 'Docker for Developers', summary: 'Run your whole stack in containers. Retired in favour of a newer course.', detail: 'Kept for existing learners.' },
  { by: 1, status: 'DRAFT', level: 'INTERMEDIATE', title: 'Database Migrations in Practice', summary: 'Change a live schema without waking anyone up at night.', detail: 'Work in progress.' },
  // Elena — data
  { by: 2, status: 'PUBLISHED', level: 'BEGINNER', title: 'Python Basics', summary: 'Variables, loops and functions, taught through small programs that do something.', detail: 'By the end you will automate one boring task of your own.' },
  { by: 2, status: 'PUBLISHED', level: 'INTERMEDIATE', title: 'Data Analysis with Pandas', summary: 'Clean, reshape and summarise real, messy data.', detail: 'Built around three real datasets and the questions people actually ask of them.' },
  { by: 2, status: 'PUBLISHED', level: 'INTERMEDIATE', title: 'Intro to Machine Learning', summary: 'Train, evaluate and honestly judge your first models.', detail: 'Plenty of intuition, a little maths, no hype.' },
  { by: 2, status: 'PUBLISHED', level: 'BEGINNER', title: 'Statistics for Decision Making', summary: 'Know when a result is real and when it is noise.', detail: 'Averages, uncertainty and A/B tests, explained without a textbook.' },
  { by: 2, status: 'ARCHIVED', level: 'INTERMEDIATE', title: 'Practical Data Visualization', summary: 'Charts that tell the truth. Retired; merged into another course.', detail: 'Kept for existing learners.' },
  { by: 2, status: 'DRAFT', level: 'ADVANCED', title: 'Advanced Time Series Forecasting', summary: 'Forecast with seasonality, trend and honest error bars.', detail: 'Work in progress.' },
];

async function main() {
  console.log('Clearing existing data…');
  // Children first: enrollments and courses restrict deletes of their parents.
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
  await prisma.course.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash(DEV_PASSWORD, BCRYPT_COST);

  console.log('Creating users…');
  const instructorIds: string[] = [];
  for (const [i, u] of [admin, ...instructors, ...students].entries()) {
    const user = await prisma.user.create({
      data: { ...u, passwordHash, createdAt: daysAgo(90 - i * 3) },
    });
    if (u.role === 'INSTRUCTOR') instructorIds.push(user.id);
  }

  console.log('Creating courses…');
  for (const [i, c] of courses.entries()) {
    const instructorId = instructorIds[c.by];
    if (!instructorId) throw new Error(`No instructor at index ${c.by}`);
    const slug = slugify(c.title);

    await prisma.course.create({
      data: {
        title: c.title,
        slug,
        summary: c.summary,
        description: `${c.summary}\n\n## What you will learn\n\n${c.detail}\n`,
        thumbnailUrl: `https://picsum.photos/seed/${slug}/640/360`,
        level: c.level,
        status: c.status,
        instructorId,
        // Drafts have never been published; archived ones were, a while ago.
        publishedAt: c.status === 'DRAFT' ? null : daysAgo(60 - i * 2),
        createdAt: daysAgo(80 - i * 2),
      },
    });
  }

  console.log(`
Seeded: 1 admin, ${instructors.length} instructors, ${students.length} students, ${courses.length} courses.

Log in with any of these (password for all: ${DEV_PASSWORD})
  admin       ${admin.email}
  instructor  priya@lumen.test
  student     sam@lumen.test
`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
