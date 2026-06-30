import { getDb } from "./db";
import { createQuizRepository, type QuizRepository } from "./repository";

// App-wide Quiz repository, bound lazily to the shared data/quiz.db connection.
let repo: QuizRepository | null = null;

export function quizRepository(): QuizRepository {
  if (!repo) repo = createQuizRepository(getDb());
  return repo;
}
