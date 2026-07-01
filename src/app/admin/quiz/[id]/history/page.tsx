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
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/admin/quiz/${id}`} className="text-sm text-ink-400 hover:text-lime">
        ← {quiz.title}
      </Link>

      <header className="mb-8 mt-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-100">
          History
        </h1>
        <p className="mt-1 text-ink-400">Past games played with this quiz.</p>
      </header>

      {records.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-700 px-6 py-12 text-center text-ink-500">
          No games played yet. Finished games show up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/quiz/${id}/history/${r.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 px-5 py-4 transition-colors hover:border-lime"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink-100">{formatPlayedAt(r.playedAt)}</p>
                  <p className="text-sm text-ink-400">
                    {r.playerCount} {r.playerCount === 1 ? "Player" : "Players"} ·{" "}
                    {r.questionCount}{" "}
                    {r.questionCount === 1 ? "Question" : "Questions"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Winner</p>
                  <p className="font-semibold text-lime">🥇 {r.winnerName ?? "—"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
