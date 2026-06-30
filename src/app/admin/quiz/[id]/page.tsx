import Link from "next/link";
import { notFound } from "next/navigation";
import { quizRepository } from "@/lib/quiz-repo";
import { POINT_VALUES, TIME_LIMITS_SEC, type Question } from "@/lib/quiz-model";
import { ConfirmButton } from "../../confirm-button";
import {
  addQuestionAction,
  deleteQuestionAction,
  renameQuizAction,
  updateQuestionAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quiz = quizRepository().getQuiz(id);
  if (!quiz) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/admin" className="text-sm text-slate-400 hover:text-indigo-400">
        ← Quiz library
      </Link>

      <form action={renameQuizAction} className="mb-8 mt-4 flex gap-3">
        <input type="hidden" name="quizId" value={quiz.id} />
        <input
          name="title"
          defaultValue={quiz.title}
          required
          aria-label="Quiz title"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-2xl font-bold text-slate-100 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          Save title
        </button>
      </form>

      <div className="space-y-6">
        {quiz.questions.map((question, i) => (
          <QuestionCard
            key={question.id}
            quizId={quiz.id}
            question={question}
            index={i}
          />
        ))}
      </div>

      <form action={addQuestionAction} className="mt-8">
        <input type="hidden" name="quizId" value={quiz.id} />
        <button
          type="submit"
          className="w-full rounded-xl border border-dashed border-slate-700 px-6 py-4 font-semibold text-slate-300 hover:border-indigo-500 hover:text-indigo-400"
        >
          + Add Question
        </button>
      </form>
    </main>
  );
}

function QuestionCard({
  quizId,
  question,
  index,
}: {
  quizId: string;
  question: Question;
  index: number;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Question {index + 1} · single-choice
        </h2>
        <form action={deleteQuestionAction}>
          <input type="hidden" name="quizId" value={quizId} />
          <input type="hidden" name="questionId" value={question.id} />
          <ConfirmButton
            message="Delete this Question? This cannot be undone."
            className="text-sm font-medium text-red-400 hover:text-red-300"
          >
            Delete
          </ConfirmButton>
        </form>
      </div>

      <form action={updateQuestionAction} className="space-y-4">
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="questionId" value={question.id} />

        <input
          name="text"
          defaultValue={question.text}
          placeholder="Question text"
          aria-label="Question text"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs text-slate-500">
            Four Options — select the one correct Option
          </legend>
          {question.options.map((option, i) => (
            <div key={option.id} className="flex items-center gap-3">
              <input type="hidden" name="optionId" value={option.id} />
              <input
                type="radio"
                name="correctOptionId"
                value={option.id}
                defaultChecked={option.id === question.correctOptionId}
                required
                aria-label={`Mark Option ${i + 1} correct`}
                className="h-4 w-4 accent-emerald-500"
              />
              <input
                name="optionText"
                defaultValue={option.text}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1} text`}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-slate-300">
            <span className="mb-1 block text-xs text-slate-500">Time limit</span>
            <select
              name="timeLimitSec"
              defaultValue={question.timeLimitSec}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {TIME_LIMITS_SEC.map((t) => (
                <option key={t} value={t}>
                  {t}s
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-300">
            <span className="mb-1 block text-xs text-slate-500">Points</span>
            <select
              name="points"
              defaultValue={question.points}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {POINT_VALUES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="ml-auto rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Save Question
          </button>
        </div>
      </form>
    </section>
  );
}
