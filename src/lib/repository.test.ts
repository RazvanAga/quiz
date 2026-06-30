import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "./db";
import { createQuizRepository, type QuizRepository } from "./repository";
import {
  DEFAULT_POINTS,
  DEFAULT_TIME_LIMIT_SEC,
  SINGLE_CHOICE_OPTION_COUNT,
  TRUE_FALSE_OPTION_COUNT,
  TRUE_FALSE_OPTION_TEXTS,
} from "./quiz-model";

let db: Database.Database;
let repo: QuizRepository;

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = createQuizRepository(db);
});

afterEach(() => {
  db.close();
});

describe("Quiz CRUD", () => {
  it("creates a Quiz with a title and no Questions", () => {
    const quiz = repo.createQuiz("Capitals");
    expect(quiz.id).toBeTruthy();
    expect(quiz.title).toBe("Capitals");
    expect(quiz.questions).toEqual([]);
  });

  it("lists Quizzes with Question count and a null last-played", () => {
    const quiz = repo.createQuiz("Capitals");
    repo.addQuestion(quiz.id);
    repo.addQuestion(quiz.id);

    const summaries = repo.listQuizzes();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: quiz.id,
      title: "Capitals",
      questionCount: 2,
      lastPlayedAt: null,
    });
  });

  it("renames a Quiz", () => {
    const quiz = repo.createQuiz("Old");
    repo.updateQuizTitle(quiz.id, "New");
    expect(repo.getQuiz(quiz.id)?.title).toBe("New");
  });

  it("returns null for a missing Quiz", () => {
    expect(repo.getQuiz("nope")).toBeNull();
  });

  it("deletes a Quiz and its Questions and Options", () => {
    const quiz = repo.createQuiz("Capitals");
    repo.addQuestion(quiz.id);
    repo.deleteQuiz(quiz.id);

    expect(repo.getQuiz(quiz.id)).toBeNull();
    expect(repo.listQuizzes()).toHaveLength(0);
    // Options of the removed Questions are gone too (cascade).
    expect(db.prepare("SELECT COUNT(*) AS n FROM option").get()).toEqual({ n: 0 });
  });
});

describe("Question authoring", () => {
  it("adds a default single-choice Question (4 Options, 20s, 1000, one correct)", () => {
    const quiz = repo.createQuiz("Capitals");
    const q = repo.addQuestion(quiz.id);

    expect(q.type).toBe("single");
    expect(q.timeLimitSec).toBe(DEFAULT_TIME_LIMIT_SEC);
    expect(q.points).toBe(DEFAULT_POINTS);
    expect(q.options).toHaveLength(SINGLE_CHOICE_OPTION_COUNT);
    // Exactly one correct Option, and it belongs to this Question.
    expect(q.options.map((o) => o.id)).toContain(q.correctOptionId);
  });

  it("appends Questions in order", () => {
    const quiz = repo.createQuiz("Capitals");
    const a = repo.addQuestion(quiz.id);
    const b = repo.addQuestion(quiz.id);

    const fetched = repo.getQuiz(quiz.id)!;
    expect(fetched.questions.map((q) => q.id)).toEqual([a.id, b.id]);
    expect(fetched.questions.map((q) => q.position)).toEqual([0, 1]);
  });

  it("edits a Question's text, Options, correct Option, time and points", () => {
    const quiz = repo.createQuiz("Capitals");
    const q = repo.addQuestion(quiz.id);

    const updated = repo.updateQuestion(q.id, {
      text: "Capital of France?",
      timeLimitSec: 30,
      points: 2000,
      options: [
        { id: q.options[0].id, text: "Paris" },
        { id: q.options[1].id, text: "Berlin" },
        { id: q.options[2].id, text: "Madrid" },
        { id: q.options[3].id, text: "Rome" },
      ],
      correctOptionId: q.options[0].id,
    });

    expect(updated.text).toBe("Capital of France?");
    expect(updated.timeLimitSec).toBe(30);
    expect(updated.points).toBe(2000);
    expect(updated.options.map((o) => o.text)).toEqual([
      "Paris",
      "Berlin",
      "Madrid",
      "Rome",
    ]);
    expect(updated.correctOptionId).toBe(q.options[0].id);

    // And it round-trips through a fresh read.
    const reread = repo.getQuiz(quiz.id)!.questions[0];
    expect(reread.text).toBe("Capital of France?");
    expect(reread.correctOptionId).toBe(q.options[0].id);
  });

  it("rejects an edit whose correct Option is not one of its Options", () => {
    const quiz = repo.createQuiz("Capitals");
    const q = repo.addQuestion(quiz.id);
    expect(() =>
      repo.updateQuestion(q.id, {
        text: "x",
        timeLimitSec: 20,
        points: 1000,
        options: q.options,
        correctOptionId: "not-an-option",
      }),
    ).toThrow();
  });

  it("adds a True/False Question (2 fixed Options, first correct)", () => {
    const quiz = repo.createQuiz("Trivia");
    const q = repo.addQuestion(quiz.id, "truefalse");

    expect(q.type).toBe("truefalse");
    expect(q.timeLimitSec).toBe(DEFAULT_TIME_LIMIT_SEC);
    expect(q.points).toBe(DEFAULT_POINTS);
    expect(q.options).toHaveLength(TRUE_FALSE_OPTION_COUNT);
    expect(q.options.map((o) => o.text)).toEqual([...TRUE_FALSE_OPTION_TEXTS]);
    // The first Option ("True") is the default correct one.
    expect(q.correctOptionId).toBe(q.options[0].id);
  });

  it("lets a True/False Question's correct Option be flipped to False", () => {
    const quiz = repo.createQuiz("Trivia");
    const q = repo.addQuestion(quiz.id, "truefalse");

    const updated = repo.updateQuestion(q.id, {
      text: "The sky is green.",
      timeLimitSec: 10,
      points: 500,
      options: q.options,
      correctOptionId: q.options[1].id,
    });

    expect(updated.correctOptionId).toBe(q.options[1].id);
    expect(repo.getQuiz(quiz.id)!.questions[0].correctOptionId).toBe(
      q.options[1].id,
    );
  });

  it("deletes a Question and its Options without touching the Quiz", () => {
    const quiz = repo.createQuiz("Capitals");
    const a = repo.addQuestion(quiz.id);
    const b = repo.addQuestion(quiz.id);

    repo.deleteQuestion(a.id);

    const fetched = repo.getQuiz(quiz.id)!;
    expect(fetched.questions.map((q) => q.id)).toEqual([b.id]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM option WHERE question_id = ?").get(a.id),
    ).toEqual({ n: 0 });
  });
});

describe("reordering Questions", () => {
  it("rewrites positions to the given order and persists it", () => {
    const quiz = repo.createQuiz("Capitals");
    const a = repo.addQuestion(quiz.id);
    const b = repo.addQuestion(quiz.id);
    const c = repo.addQuestion(quiz.id);

    repo.reorderQuestions(quiz.id, [c.id, a.id, b.id]);

    const fetched = repo.getQuiz(quiz.id)!;
    expect(fetched.questions.map((q) => q.id)).toEqual([c.id, a.id, b.id]);
    expect(fetched.questions.map((q) => q.position)).toEqual([0, 1, 2]);
  });

  it("rejects an order that is not a permutation of the Quiz's Questions", () => {
    const quiz = repo.createQuiz("Capitals");
    const a = repo.addQuestion(quiz.id);
    const b = repo.addQuestion(quiz.id);

    // Missing one id.
    expect(() => repo.reorderQuestions(quiz.id, [a.id])).toThrow();
    // An id that does not belong to this Quiz.
    expect(() =>
      repo.reorderQuestions(quiz.id, [a.id, b.id, "stranger"]),
    ).toThrow();
  });
});

describe("persistence across reopen", () => {
  it("keeps Quizzes and Questions in a real file after closing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quiz-test-"));
    const file = path.join(dir, "quiz.db");
    try {
      const db1 = openDatabase(file);
      const repo1 = createQuizRepository(db1);
      const quiz = repo1.createQuiz("Persisted");
      repo1.updateQuestion(repo1.addQuestion(quiz.id).id, {
        text: "Still here?",
        timeLimitSec: 60,
        points: 500,
        options: repo1.getQuiz(quiz.id)!.questions[0].options,
        correctOptionId: repo1.getQuiz(quiz.id)!.questions[0].options[0].id,
      });
      db1.close();

      const db2 = openDatabase(file);
      const repo2 = createQuizRepository(db2);
      const reopened = repo2.getQuiz(quiz.id);
      expect(reopened?.title).toBe("Persisted");
      expect(reopened?.questions[0].text).toBe("Still here?");
      expect(reopened?.questions[0].timeLimitSec).toBe(60);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
