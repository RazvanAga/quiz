import Link from "next/link";
import { notFound } from "next/navigation";
import { quizRepository } from "@/lib/quiz-repo";
import { gameRecordRepository } from "@/lib/game-record-repo";
import { formatPlayedAt } from "@/lib/game-record-format";
import { avatarGlyph } from "@/lib/game/avatars";
import { answerStyle, AnswerShape } from "@/lib/game/answer-style";

// One Game Record in full (docs/CONTEXT.md): the final Podium, each Question's
// Distribution across its Options, and a per-Player per-Question drill-down of
// what each Player picked and scored. Read straight from the frozen record, so
// later edits to the Quiz never change what a past Game shows.
export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function GameRecordDetailPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>;
}) {
  const { id, recordId } = await params;
  const quiz = quizRepository().getQuiz(id);
  if (!quiz) notFound();

  const record = gameRecordRepository().getGameRecord(recordId);
  if (!record || record.quizId !== id) notFound();

  return (
    <main id="main" className="mx-auto max-w-4xl px-6 py-12">
      <Link href={`/admin/quiz/${id}/history`} className="text-sm text-ink-400 hover:text-lime">
        ← History
      </Link>

      <header className="mb-10 mt-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-100">
          {quiz.title}
        </h1>
        <p className="mt-1 text-ink-400">
          {formatPlayedAt(record.playedAt)} · {record.playerCount}{" "}
          {record.playerCount === 1 ? "Player" : "Players"} · PIN {record.pin}
        </p>
      </header>

      {/* Podium */}
      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-400">
          Podium
        </h2>
        <ol className="flex flex-col gap-3">
          {record.standings.map((s) => {
            const medal = s.rank <= 3 ? MEDALS[s.rank - 1] : null;
            return (
              <li
                key={s.playerId}
                className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-ink-100 ${
                  medal ? "border-lime/40 bg-lime/10" : "border-ink-800 bg-ink-900/60"
                }`}
              >
                <span className="w-10 text-center font-display text-2xl font-bold tabular-nums">
                  {medal ?? s.rank}
                </span>
                <span className="text-3xl" aria-hidden>
                  {avatarGlyph(s.avatar)}
                </span>
                <span className="flex-1 truncate text-lg font-bold">{s.name}</span>
                <span className="font-display text-xl font-bold tabular-nums text-lime">
                  {s.score}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Per-Question Distribution */}
      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-400">
          Questions
        </h2>
        <div className="space-y-5">
          {record.questions.map((q) => (
            <div key={q.position} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h3 className="font-semibold text-ink-100">
                  <span className="text-ink-500">Q{q.position + 1}.</span>{" "}
                  {q.text || <span className="text-ink-500">(untitled)</span>}
                </h3>
                <span className="shrink-0 text-xs text-ink-500">
                  {q.points} pts · {q.timeLimitSec}s
                </span>
              </div>
              <ul className="space-y-2">
                {q.options.map((o, i) => {
                  const style = answerStyle(i);
                  const isCorrect = o.optionId === q.correctOptionId;
                  return (
                    <li
                      key={o.optionId}
                      className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-white ${style.face} ${
                        isCorrect ? "ring-2 ring-white" : "opacity-70"
                      }`}
                    >
                      <AnswerShape index={i} className="h-4 w-4 shrink-0 text-white" />
                      <span className="flex-1 font-semibold">{o.text}</span>
                      {isCorrect && <span aria-hidden>✓</span>}
                      <span className="font-mono tabular-nums">{o.count}</span>
                    </li>
                  );
                })}
              </ul>
              {q.noAnswer > 0 && (
                <p className="mt-2 text-sm text-ink-500">{q.noAnswer} didn&apos;t answer</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Per-Player per-Question drill-down */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-400">
          Player breakdown
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-ink-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink-900/80 text-left text-ink-400">
                <th className="sticky left-0 bg-ink-900/80 px-4 py-3 font-medium">Player</th>
                {record.questions.map((q) => (
                  <th key={q.position} className="px-4 py-3 text-center font-medium">
                    Q{q.position + 1}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {record.standings.map((s) => (
                <tr key={s.playerId} className="border-t border-ink-800">
                  <th
                    scope="row"
                    className="sticky left-0 bg-ink-950/80 px-4 py-3 text-left font-semibold text-ink-100"
                  >
                    <span className="mr-2" aria-hidden>
                      {avatarGlyph(s.avatar)}
                    </span>
                    {s.name}
                  </th>
                  {record.questions.map((q) => {
                    const r = q.responses.find((x) => x.playerId === s.playerId);
                    return (
                      <td key={q.position} className="px-4 py-3 text-center">
                        <PlayerCell
                          response={r}
                          optionText={
                            r?.optionId
                              ? q.options.find((o) => o.optionId === r.optionId)?.text ?? null
                              : null
                          }
                        />
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-lime">
                    {s.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

// One Player's Response to one Question: the Option they picked (or "—" if they
// never answered), tinted by right/wrong, with the points they earned.
function PlayerCell({
  response,
  optionText,
}: {
  response:
    | { optionId: string | null; timeUsed: number | null; correct: boolean; points: number }
    | undefined;
  optionText: string | null;
}) {
  if (!response || response.optionId === null) {
    return <span className="text-ink-600">—</span>;
  }
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className={`max-w-[10rem] truncate font-medium ${
          response.correct ? "text-correct" : "text-wrong"
        }`}
        title={optionText ?? undefined}
      >
        {response.correct ? "✓" : "✗"} {optionText ?? "?"}
      </span>
      <span className="font-mono text-xs tabular-nums text-ink-500">+{response.points}</span>
    </span>
  );
}
