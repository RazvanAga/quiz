import { recordHealthCheck } from "@/lib/db";
import { SocketPing } from "./socket-ping";

// Server component: exercises the SQLite read/write path on each load.
export const dynamic = "force-dynamic";

export default function Home() {
  const { count, journalMode } = recordHealthCheck("page load");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Quiz</h1>
        <p className="text-slate-400">
          Walking skeleton — every layer of the stack wired through one process.
        </p>
      </header>

      <section className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            SQLite (better-sqlite3)
          </h2>
          <p className="mt-2 text-slate-200">
            Health rows written: <span className="font-mono font-semibold">{count}</span>
          </p>
          <p className="text-slate-200">
            journal_mode: <span className="font-mono font-semibold">{journalMode}</span>
          </p>
        </div>

        <SocketPing />
      </section>
    </main>
  );
}
