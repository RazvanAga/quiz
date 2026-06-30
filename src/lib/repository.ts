import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  DEFAULT_POINTS,
  DEFAULT_TIME_LIMIT_SEC,
  SINGLE_CHOICE_OPTION_COUNT,
  TRUE_FALSE_OPTION_TEXTS,
  type Option,
  type Question,
  type QuestionInput,
  type QuestionType,
  type Quiz,
  type QuizSummary,
} from "./quiz-model";

// Repository (Seam 2): wraps SQLite for Quiz/Question/Option CRUD. Synchronous
// (better-sqlite3). Pure persistence — invariants that matter to authoring
// (exactly one correct Option) are guarded here so callers can't corrupt data.

interface QuizRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface QuestionRow {
  id: string;
  quiz_id: string;
  position: number;
  type: "single" | "truefalse";
  text: string;
  image_url: string | null;
  correct_option_id: string | null;
  time_limit_sec: number;
  points: number;
}

interface OptionRow {
  id: string;
  question_id: string;
  position: number;
  text: string;
}

export interface QuizRepository {
  listQuizzes(): QuizSummary[];
  createQuiz(title: string): Quiz;
  getQuiz(id: string): Quiz | null;
  updateQuizTitle(id: string, title: string): void;
  deleteQuiz(id: string): void;
  addQuestion(quizId: string, type?: QuestionType): Question;
  updateQuestion(questionId: string, input: QuestionInput): Question;
  reorderQuestions(quizId: string, orderedIds: string[]): void;
  deleteQuestion(questionId: string): void;
}

export function createQuizRepository(db: Database.Database): QuizRepository {
  const touchQuiz = db.prepare(
    "UPDATE quiz SET updated_at = datetime('now') WHERE id = ?",
  );

  function loadOptions(questionId: string): Option[] {
    const rows = db
      .prepare("SELECT * FROM option WHERE question_id = ? ORDER BY position")
      .all(questionId) as OptionRow[];
    return rows.map((r) => ({ id: r.id, text: r.text }));
  }

  function toQuestion(row: QuestionRow): Question {
    const options = loadOptions(row.id);
    return {
      id: row.id,
      quizId: row.quiz_id,
      position: row.position,
      type: row.type,
      text: row.text,
      imageUrl: row.image_url,
      options,
      correctOptionId: row.correct_option_id ?? "",
      timeLimitSec: row.time_limit_sec,
      points: row.points,
    };
  }

  function getQuestionRow(questionId: string): QuestionRow {
    const row = db
      .prepare("SELECT * FROM question WHERE id = ?")
      .get(questionId) as QuestionRow | undefined;
    if (!row) throw new Error(`Question not found: ${questionId}`);
    return row;
  }

  return {
    listQuizzes(): QuizSummary[] {
      // last-played comes from Game Records (added in #8); none exist yet, so
      // it is always null for now.
      const rows = db
        .prepare(
          `SELECT q.id, q.title,
                  (SELECT COUNT(*) FROM question WHERE quiz_id = q.id) AS questionCount
           FROM quiz q
           ORDER BY q.updated_at DESC`,
        )
        .all() as { id: string; title: string; questionCount: number }[];
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        questionCount: r.questionCount,
        lastPlayedAt: null,
      }));
    },

    createQuiz(title: string): Quiz {
      const id = randomUUID();
      db.prepare("INSERT INTO quiz (id, title) VALUES (?, ?)").run(id, title);
      return this.getQuiz(id)!;
    },

    getQuiz(id: string): Quiz | null {
      const quiz = db.prepare("SELECT * FROM quiz WHERE id = ?").get(id) as
        | QuizRow
        | undefined;
      if (!quiz) return null;

      const questionRows = db
        .prepare("SELECT * FROM question WHERE quiz_id = ? ORDER BY position")
        .all(id) as QuestionRow[];

      return {
        id: quiz.id,
        title: quiz.title,
        createdAt: quiz.created_at,
        updatedAt: quiz.updated_at,
        questions: questionRows.map(toQuestion),
      };
    },

    updateQuizTitle(id: string, title: string): void {
      db.prepare(
        "UPDATE quiz SET title = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(title, id);
    },

    deleteQuiz(id: string): void {
      // ON DELETE CASCADE removes the Quiz's Questions and their Options.
      db.prepare("DELETE FROM quiz WHERE id = ?").run(id);
    },

    addQuestion(quizId: string, type: QuestionType = "single"): Question {
      // Single-choice gets 4 blank Options to fill in; True/False gets exactly
      // 2 fixed Options. Either way the first Option is correct by default, so
      // the Question always satisfies the one-correct-Option invariant.
      const optionTexts =
        type === "truefalse"
          ? [...TRUE_FALSE_OPTION_TEXTS]
          : Array.from({ length: SINGLE_CHOICE_OPTION_COUNT }, () => "");

      const create = db.transaction((): string => {
        const { next } = db
          .prepare(
            "SELECT COALESCE(MAX(position) + 1, 0) AS next FROM question WHERE quiz_id = ?",
          )
          .get(quizId) as { next: number };

        const questionId = randomUUID();
        const optionIds = optionTexts.map(() => randomUUID());

        db.prepare(
          `INSERT INTO question
             (id, quiz_id, position, type, text, correct_option_id, time_limit_sec, points)
           VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
        ).run(
          questionId,
          quizId,
          next,
          type,
          optionIds[0],
          DEFAULT_TIME_LIMIT_SEC,
          DEFAULT_POINTS,
        );

        const insertOption = db.prepare(
          "INSERT INTO option (id, question_id, position, text) VALUES (?, ?, ?, ?)",
        );
        optionIds.forEach((optionId, i) =>
          insertOption.run(optionId, questionId, i, optionTexts[i]),
        );

        touchQuiz.run(quizId);
        return questionId;
      });

      return toQuestion(getQuestionRow(create()));
    },

    updateQuestion(questionId: string, input: QuestionInput): Question {
      const optionIds = new Set(input.options.map((o) => o.id));
      if (!optionIds.has(input.correctOptionId)) {
        throw new Error("correctOptionId must be one of the Question's Options");
      }

      const apply = db.transaction(() => {
        const existing = getQuestionRow(questionId);

        db.prepare(
          `UPDATE question
             SET text = ?, correct_option_id = ?, time_limit_sec = ?, points = ?,
                 updated_at = datetime('now')
           WHERE id = ?`,
        ).run(
          input.text,
          input.correctOptionId,
          input.timeLimitSec,
          input.points,
          questionId,
        );

        const updateOption = db.prepare(
          "UPDATE option SET text = ? WHERE id = ? AND question_id = ?",
        );
        for (const opt of input.options) {
          updateOption.run(opt.text, opt.id, questionId);
        }

        touchQuiz.run(existing.quiz_id);
      });

      apply();
      return toQuestion(getQuestionRow(questionId));
    },

    reorderQuestions(quizId: string, orderedIds: string[]): void {
      const apply = db.transaction(() => {
        const currentIds = (
          db
            .prepare("SELECT id FROM question WHERE quiz_id = ?")
            .all(quizId) as { id: string }[]
        ).map((r) => r.id);

        // orderedIds must be exactly this Quiz's Questions, each once — anything
        // else would drop or duplicate a Question's position.
        const isPermutation =
          orderedIds.length === currentIds.length &&
          new Set(orderedIds).size === orderedIds.length &&
          orderedIds.every((id) => currentIds.includes(id));
        if (!isPermutation) {
          throw new Error("orderedIds must be a permutation of the Quiz's Questions");
        }

        const setPosition = db.prepare(
          "UPDATE question SET position = ? WHERE id = ? AND quiz_id = ?",
        );
        orderedIds.forEach((id, i) => setPosition.run(i, id, quizId));

        touchQuiz.run(quizId);
      });

      apply();
    },

    deleteQuestion(questionId: string): void {
      const row = getQuestionRow(questionId);
      // ON DELETE CASCADE removes the Question's Options.
      db.prepare("DELETE FROM question WHERE id = ?").run(questionId);
      touchQuiz.run(row.quiz_id);
    },
  };
}
