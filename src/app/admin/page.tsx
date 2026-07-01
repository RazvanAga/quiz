import Link from "next/link";
import { quizRepository } from "@/lib/quiz-repo";
import { Wordmark } from "@/app/ui/brand";
import { createQuizAction, deleteQuizAction } from "./actions";
import { ConfirmButton } from "./confirm-button";
import { StartGameButton } from "./start-game-button";

// The /admin Quiz library: every Quiz with its title, Question count, and when
// it was last played. (nginx Basic Auth gates this area in #13; no app auth.)
export const dynamic = "force-dynamic";

export default function AdminLibraryPage() {
  const quizzes = quizRepository().listQuizzes();

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <Wordmark size="sm" className="mb-5" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-100">
          Quiz library
        </h1>
        <p className="mt-1 text-ink-400">Author and manage your quizzes.</p>
      </header>

      <form action={createQuizAction} className="mb-10 flex gap-3">
        <input
          name="title"
          required
          placeholder="New quiz title"
          className="flex-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-ink-100 placeholder:text-ink-500 focus:border-lime focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-lime px-5 py-2.5 font-bold text-ink-950 shadow-[0_4px_0_0_var(--color-lime-deep)] transition-[transform,box-shadow] active:translate-y-[2px] active:shadow-[0_2px_0_0_var(--color-lime-deep)]"
        >
          Create quiz
        </button>
      </form>

      {quizzes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-700 px-6 py-12 text-center text-ink-500">
          No quizzes yet. Create your first one above.
        </p>
      ) : (
        <ul className="space-y-3">
          {quizzes.map((quiz) => (
            <li
              key={quiz.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 px-5 py-4 transition-colors hover:border-ink-600"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/quiz/${quiz.id}`}
                  className="truncate text-lg font-semibold text-ink-100 hover:text-lime"
                >
                  {quiz.title}
                </Link>
                <p className="text-sm text-ink-400">
                  {quiz.questionCount}{" "}
                  {quiz.questionCount === 1 ? "question" : "questions"} · Last played:{" "}
                  {quiz.lastPlayedAt ?? "Never"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {quiz.questionCount > 0 && (
                  <StartGameButton
                    quizId={quiz.id}
                    className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink-950 transition hover:bg-lime-glow disabled:opacity-60"
                  />
                )}
                <Link
                  href={`/admin/quiz/${quiz.id}`}
                  className="rounded-full border border-ink-700 px-4 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-800"
                >
                  Edit
                </Link>
                <form action={deleteQuizAction}>
                  <input type="hidden" name="quizId" value={quiz.id} />
                  <ConfirmButton
                    message={`Delete the Quiz "${quiz.title}" and all its Questions? This cannot be undone.`}
                    className="rounded-full border border-wrong/40 px-4 py-2 text-sm font-medium text-wrong transition hover:bg-wrong/10"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
