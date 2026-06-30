"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { quizRepository } from "@/lib/quiz-repo";

export async function createQuizAction(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const quiz = quizRepository().createQuiz(title);
  redirect(`/admin/quiz/${quiz.id}`);
}

export async function deleteQuizAction(formData: FormData): Promise<void> {
  const id = String(formData.get("quizId") ?? "");
  if (!id) return;
  quizRepository().deleteQuiz(id);
  revalidatePath("/admin");
}
