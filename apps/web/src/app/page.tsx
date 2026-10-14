import { getHealth } from '@/lib/api';

// The status line must reflect the API right now, not at build time.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await getHealth();

  const status = !health
    ? { label: 'API unreachable', detail: 'Is it running? Try `pnpm dev`.', tone: 'bg-red-500' }
    : health.status === 'ok'
      ? {
          label: 'API and database are healthy',
          detail: `Up ${health.uptimeSeconds}s`,
          tone: 'bg-green-500',
        }
      : {
          label: 'API is up, database is not',
          detail: 'Is Docker running? `docker compose up -d`',
          tone: 'bg-amber-500',
        };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-16">
      <div>
        <p className="text-sm font-semibold tracking-widest text-slate-500 uppercase">Lumen</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Learn something new, one lesson at a time.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Courses, lessons and progress that is saved. This is the groundwork — the real pages
          arrive in the next blocks.
        </p>
      </div>

      <section aria-labelledby="status-heading" className="rounded-lg border border-slate-200 p-4">
        <h2 id="status-heading" className="text-sm font-semibold text-slate-500">
          System status
        </h2>
        <p role="status" className="mt-2 flex items-center gap-3">
          <span aria-hidden="true" className={`inline-block size-3 rounded-full ${status.tone}`} />
          <span className="font-medium">{status.label}</span>
          <span className="text-sm text-slate-500">{status.detail}</span>
        </p>
      </section>
    </main>
  );
}
