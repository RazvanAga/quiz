"use server";

import { revalidatePath } from "next/cache";
import { quizRepository } from "@/lib/quiz-repo";
import { deleteUpload, saveUploadedImage } from "@/lib/uploads";
import type { Option, QuestionType } from "@/lib/quiz-model";

function revalidateEditor(quizId: string): void {
  revalidatePath(`/admin/quiz/${quizId}`);
  revalidatePath("/admin");
}

export async function renameQuizAction(formData: FormData): Promise<void> {
  const quizId = String(formData.get("quizId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!quizId || !title) return;
  quizRepository().updateQuizTitle(quizId, title);
  revalidateEditor(quizId);
}

export async function addQuestionAction(formData: FormData): Promise<void> {
  const quizId = String(formData.get("quizId") ?? "");
  if (!quizId) return;
  const type: QuestionType =
    formData.get("type") === "truefalse" ? "truefalse" : "single";
  quizRepository().addQuestion(quizId, type);
  revalidateEditor(quizId);
}

export async function reorderQuestionsAction(
  quizId: string,
  orderedIds: string[],
): Promise<void> {
  if (!quizId || orderedIds.length === 0) return;
  quizRepository().reorderQuestions(quizId, orderedIds);
  revalidateEditor(quizId);
}

export async function updateQuestionAction(formData: FormData): Promise<void> {
  const quizId = String(formData.get("quizId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  if (!quizId || !questionId) return;

  const ids = formData.getAll("optionId").map(String);
  const texts = formData.getAll("optionText").map(String);
  const options: Option[] = ids.map((id, i) => ({ id, text: (texts[i] ?? "").trim() }));

  quizRepository().updateQuestion(questionId, {
    text: String(formData.get("text") ?? "").trim(),
    timeLimitSec: Number(formData.get("timeLimitSec")),
    points: Number(formData.get("points")),
    options,
    correctOptionId: String(formData.get("correctOptionId") ?? ""),
  });
  revalidateEditor(quizId);
}

// Attach or replace a Question's optional image: save the upload to disk, point
// the Question at its served URL, and delete the file it replaced (if any).
export async function setQuestionImageAction(formData: FormData): Promise<void> {
  const quizId = String(formData.get("quizId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const file = formData.get("image");
  if (!quizId || !questionId || !(file instanceof File) || file.size === 0) return;

  const url = await saveUploadedImage(file);
  if (!url) return; // not an accepted image type — leave the Question unchanged
  const previous = quizRepository().setQuestionImage(questionId, url);
  await deleteUpload(previous);
  revalidateEditor(quizId);
}

// Remove a Question's image: clear the URL and delete the file off disk.
export async function removeQuestionImageAction(formData: FormData): Promise<void> {
  const quizId = String(formData.get("quizId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  if (!quizId || !questionId) return;
  const previous = quizRepository().setQuestionImage(questionId, null);
  await deleteUpload(previous);
  revalidateEditor(quizId);
}

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  const quizId = String(formData.get("quizId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  if (!quizId || !questionId) return;
  quizRepository().deleteQuestion(questionId);
  revalidateEditor(quizId);
}
