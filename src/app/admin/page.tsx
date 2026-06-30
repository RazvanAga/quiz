import Link from "next/link";
import { quizRepository } from "@/lib/quiz-repo";
import { createQuizAction, deleteQuizAction } from "./actions";
import { ConfirmButton } from "./confirm-button";
import { StartGameButton } from "./start-game-button";

// The /admin Quiz library: every Quiz with its title, Question count, and when
// it was last played. (nginx Basic Auth gates this area in #13; no app auth.)
export const dynamic = "force-dynamic";

export default function AdminLibraryPage() {
  const quizzes = quizRepository().listQuizzes();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Quiz library</h1>
        <p className="mt-1 text-slate-400">Author and manage your Quizzes.</p>
      </header>

      <form action={createQuizAction} className="mb-10 flex gap-3">
        <input
          name="title"
          required
          placeholder="New Quiz title"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-500"
        >
          Create Quiz
        </button>
      </form>

      {quizzes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 px-6 py-12 text-center text-slate-500">
          No Quizzes yet. Create your first one above.
        </p>
      ) : (
        <ul className="space-y-3">
          {quizzes.map((quiz) => (
            <li
              key={quiz.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/quiz/${quiz.id}`}
                  className="truncate text-lg font-semibold text-slate-100 hover:text-indigo-400"
                >
                  {quiz.title}
                </Link>
                <p className="text-sm text-slate-400">
                  {quiz.questionCount}{" "}
                  {quiz.questionCount === 1 ? "Question" : "Questions"} · Last played:{" "}
                  {quiz.lastPlayedAt ?? "Never"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {quiz.questionCount > 0 && (
                  <StartGameButton
                    quizId={quiz.id}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  />
                )}
                <Link
                  href={`/admin/quiz/${quiz.id}`}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  Edit
                </Link>
                <form action={deleteQuizAction}>
                  <input type="hidden" name="quizId" value={quiz.id} />
                  <ConfirmButton
                    message={`Delete the Quiz "${quiz.title}" and all its Questions? This cannot be undone.`}
                    className="rounded-lg border border-red-900/60 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-950/40"
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
