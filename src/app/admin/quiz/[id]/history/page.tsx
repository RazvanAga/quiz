import Link from "next/link";
import { notFound } from "next/navigation";
import { quizRepository } from "@/lib/quiz-repo";
import { gameRecordRepository } from "@/lib/game-record-repo";
import { formatPlayedAt } from "@/lib/game-record-format";

// A Quiz's History (docs/CONTEXT.md): every finished Game persisted as a Game
// Record, most recent first, with its date, how many Players played, and who
// won. Each links to the full Game Record detail.
export const dynamic = "force-dynamic";

export default async function QuizHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quiz = quizRepository().getQuiz(id);
  if (!quiz) notFound();

  const records = gameRecordRepository().listGameRecords(id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={`/admin/quiz/${id}`}
        className="text-sm text-slate-400 hover:text-indigo-400"
      >
        ← {quiz.title}
      </Link>

      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-slate-400">
          Past Games played with this Quiz.
        </p>
      </header>

      {records.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 px-6 py-12 text-center text-slate-500">
          No Games played yet. Finished Games show up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/quiz/${id}/history/${r.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-indigo-500"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100">
                    {formatPlayedAt(r.playedAt)}
                  </p>
                  <p className="text-sm text-slate-400">
                    {r.playerCount} {r.playerCount === 1 ? "Player" : "Players"} ·{" "}
                    {r.questionCount}{" "}
                    {r.questionCount === 1 ? "Question" : "Questions"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Winner
                  </p>
                  <p className="font-semibold text-amber-400">
                    🥇 {r.winnerName ?? "—"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
