import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { quizRepository } from "@/lib/quiz-repo";
import { POINT_VALUES, TIME_LIMITS_SEC, type Question } from "@/lib/quiz-model";
import { ConfirmButton } from "../../confirm-button";
import { StartGameButton } from "../../start-game-button";
import { QuestionList } from "./question-list";
import {
  addQuestionAction,
  deleteQuestionAction,
  removeQuestionImageAction,
  renameQuizAction,
  setQuestionImageAction,
  updateQuestionAction,
} from "./actions";

// Image types the upload endpoint accepts, mirrored here to hint the file picker.
const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

export const dynamic = "force-dynamic";

export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quiz = quizRepository().getQuiz(id);
  if (!quiz) notFound();

  // Keyed by Question id so the drag-reorder client can render them in any order.
  const cards: Record<string, ReactNode> = Object.fromEntries(
    quiz.questions.map((question, i) => [
      question.id,
      <QuestionCard quizId={quiz.id} question={question} index={i} />,
    ]),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm text-slate-400 hover:text-indigo-400">
          ← Quiz library
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/quiz/${quiz.id}/history`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            History
          </Link>
          {quiz.questions.length > 0 && (
            <StartGameButton
              quizId={quiz.id}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            />
          )}
        </div>
      </div>

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

      {quiz.questions.length > 0 ? (
        <QuestionList quizId={quiz.id} ids={quiz.questions.map((q) => q.id)} cards={cards} />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-800 px-6 py-8 text-center text-slate-500">
          No Questions yet. Add one below.
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3">
        <form action={addQuestionAction}>
          <input type="hidden" name="quizId" value={quiz.id} />
          <input type="hidden" name="type" value="single" />
          <button
            type="submit"
            className="w-full rounded-xl border border-dashed border-slate-700 px-6 py-4 font-semibold text-slate-300 hover:border-indigo-500 hover:text-indigo-400"
          >
            + Add single-choice
          </button>
        </form>
        <form action={addQuestionAction}>
          <input type="hidden" name="quizId" value={quiz.id} />
          <input type="hidden" name="type" value="truefalse" />
          <button
            type="submit"
            className="w-full rounded-xl border border-dashed border-slate-700 px-6 py-4 font-semibold text-slate-300 hover:border-indigo-500 hover:text-indigo-400"
          >
            + Add True/False
          </button>
        </form>
      </div>
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
  const isTrueFalse = question.type === "truefalse";

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Question {index + 1} · {isTrueFalse ? "True/False" : "single-choice"}
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

      {/* Optional image, edited on its own so saving text/Options never disturbs
          it. A file input + explicit button matches the rest of the editor. */}
      <div className="mb-4">
        {question.imageUrl ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.imageUrl}
              alt=""
              className="max-h-40 rounded-lg border border-slate-800 object-contain"
            />
            <div className="flex flex-col gap-2">
              <form action={setQuestionImageAction} className="flex flex-col gap-2">
                <input type="hidden" name="quizId" value={quizId} />
                <input type="hidden" name="questionId" value={question.id} />
                <input
                  type="file"
                  name="image"
                  accept={IMAGE_ACCEPT}
                  aria-label="Replace image"
                  className="text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200 hover:file:bg-slate-700"
                />
                <button
                  type="submit"
                  className="w-fit rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  Replace image
                </button>
              </form>
              <form action={removeQuestionImageAction}>
                <input type="hidden" name="quizId" value={quizId} />
                <input type="hidden" name="questionId" value={question.id} />
                <button
                  type="submit"
                  className="w-fit text-sm font-medium text-red-400 hover:text-red-300"
                >
                  Remove image
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={setQuestionImageAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="quizId" value={quizId} />
            <input type="hidden" name="questionId" value={question.id} />
            <input
              type="file"
              name="image"
              accept={IMAGE_ACCEPT}
              aria-label="Question image"
              className="text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200 hover:file:bg-slate-700"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Add image
            </button>
          </form>
        )}
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
            {isTrueFalse
              ? "Two fixed Options — select the correct one"
              : "Four Options — select the one correct Option"}
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
              {isTrueFalse ? (
                <>
                  {/* Texts are fixed for True/False; carry them through unchanged. */}
                  <input type="hidden" name="optionText" value={option.text} />
                  <span className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100">
                    {option.text}
                  </span>
                </>
              ) : (
                <input
                  name="optionText"
                  defaultValue={option.text}
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1} text`}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              )}
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
