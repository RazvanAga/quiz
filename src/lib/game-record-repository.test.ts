import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "./db";
import { createQuizRepository, type QuizRepository } from "./repository";
import {
  createGameRecordRepository,
  type GameRecordRepository,
} from "./game-record-repository";
import type { GameRecordInput } from "./game/engine";

let db: Database.Database;
let quizzes: QuizRepository;
let records: GameRecordRepository;
let quizId: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  quizzes = createQuizRepository(db);
  records = createGameRecordRepository(db);
  // A Game Record is scoped to a Quiz (FK), so we need one to hang it off.
  quizId = quizzes.createQuiz("Capitals").id;
});

afterEach(() => {
  db.close();
});

// A two-Question Game between Ada (who wins) and Bo, distilled to the shape
// engine.buildGameRecord produces at finish.
function sampleRecord(): GameRecordInput {
  return {
    quizId,
    pin: "0042",
    playerCount: 2,
    standings: [
      { playerId: "ada", name: "Ada", avatar: "fox", score: 1500, rank: 1 },
      { playerId: "bo", name: "Bo", avatar: "owl", score: 500, rank: 2 },
    ],
    rounds: [
      {
        index: 0,
        questionId: "q1",
        type: "single",
        text: "Capital of France?",
        options: [
          { id: "o1", text: "Paris" },
          { id: "o2", text: "Berlin" },
          { id: "o3", text: "Madrid" },
          { id: "o4", text: "Rome" },
        ],
        correctOptionId: "o1",
        points: 1000,
        timeLimitSec: 20,
        distribution: {
          counts: [
            { optionId: "o1", count: 1 },
            { optionId: "o2", count: 1 },
            { optionId: "o3", count: 0 },
            { optionId: "o4", count: 0 },
          ],
          noAnswer: 0,
        },
        responses: [
          { playerId: "ada", optionId: "o1", timeUsed: 1000, correct: true, points: 1000 },
          { playerId: "bo", optionId: "o2", timeUsed: 2000, correct: false, points: 0 },
        ],
      },
      {
        index: 1,
        questionId: "q2",
        type: "truefalse",
        text: "The sky is blue.",
        options: [
          { id: "t", text: "True" },
          { id: "f", text: "False" },
        ],
        correctOptionId: "t",
        points: 1000,
        timeLimitSec: 10,
        distribution: {
          counts: [
            { optionId: "t", count: 2 },
            { optionId: "f", count: 0 },
          ],
          noAnswer: 0,
        },
        responses: [
          { playerId: "ada", optionId: "t", timeUsed: 500, correct: true, points: 500 },
          { playerId: "bo", optionId: "t", timeUsed: 500, correct: true, points: 500 },
        ],
      },
    ],
  };
}

describe("Game Record write/read round-trip", () => {
  it("lists a saved record with date, Player count and winner", () => {
    records.saveGameRecord(sampleRecord());

    const list = records.listGameRecords(quizId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      playerCount: 2,
      questionCount: 2,
      winnerName: "Ada",
    });
    expect(list[0].playedAt).toBeTruthy();
    expect(list[0].id).toBeTruthy();
  });

  it("reads back the Podium, Distributions and per-Player Responses", () => {
    const id = records.saveGameRecord(sampleRecord());

    const detail = records.getGameRecord(id)!;
    expect(detail.pin).toBe("0042");
    expect(detail.playerCount).toBe(2);

    // Podium standings, ranked.
    expect(detail.standings).toEqual([
      { playerId: "ada", name: "Ada", avatar: "fox", score: 1500, rank: 1 },
      { playerId: "bo", name: "Bo", avatar: "owl", score: 500, rank: 2 },
    ]);

    // Questions in order, with frozen text and Distribution counts on Options.
    expect(detail.questions.map((q) => q.text)).toEqual([
      "Capital of France?",
      "The sky is blue.",
    ]);
    const q1 = detail.questions[0];
    expect(q1.type).toBe("single");
    expect(q1.correctOptionId).toBe("o1");
    expect(q1.options).toEqual([
      { optionId: "o1", text: "Paris", count: 1 },
      { optionId: "o2", text: "Berlin", count: 1 },
      { optionId: "o3", text: "Madrid", count: 0 },
      { optionId: "o4", text: "Rome", count: 0 },
    ]);

    // Per-Player per-Question Responses, correct flag round-tripped as boolean.
    const ada = q1.responses.find((r) => r.playerId === "ada")!;
    expect(ada).toEqual({
      playerId: "ada",
      optionId: "o1",
      timeUsed: 1000,
      correct: true,
      points: 1000,
    });
    const bo = q1.responses.find((r) => r.playerId === "bo")!;
    expect(bo.correct).toBe(false);
    expect(bo.points).toBe(0);
  });

  it("stores an unanswered Response as a null Option with no time", () => {
    const record = sampleRecord();
    record.rounds[0].responses[1] = {
      playerId: "bo",
      optionId: null,
      timeUsed: null,
      correct: false,
      points: 0,
    };
    record.rounds[0].distribution = {
      counts: [
        { optionId: "o1", count: 1 },
        { optionId: "o2", count: 0 },
        { optionId: "o3", count: 0 },
        { optionId: "o4", count: 0 },
      ],
      noAnswer: 1,
    };

    const id = records.saveGameRecord(record);
    const detail = records.getGameRecord(id)!;
    expect(detail.questions[0].noAnswer).toBe(1);
    const bo = detail.questions[0].responses.find((r) => r.playerId === "bo")!;
    expect(bo.optionId).toBeNull();
    expect(bo.timeUsed).toBeNull();
  });

  it("scopes History to its Quiz and returns null for a missing record", () => {
    records.saveGameRecord(sampleRecord());
    const other = quizzes.createQuiz("Other").id;

    expect(records.listGameRecords(other)).toHaveLength(0);
    expect(records.getGameRecord("nope")).toBeNull();
  });

  it("cascades History away when its Quiz is deleted", () => {
    records.saveGameRecord(sampleRecord());
    quizzes.deleteQuiz(quizId);

    expect(records.listGameRecords(quizId)).toHaveLength(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM game_response").get()).toEqual({
      n: 0,
    });
  });

  it("keeps a Game Record in a real file after closing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quiz-record-test-"));
    const file = path.join(dir, "quiz.db");
    try {
      const db1 = openDatabase(file);
      const qid = createQuizRepository(db1).createQuiz("Persisted").id;
      const record = sampleRecord();
      record.quizId = qid;
      const id = createGameRecordRepository(db1).saveGameRecord(record);
      db1.close();

      const db2 = openDatabase(file);
      const reread = createGameRecordRepository(db2).getGameRecord(id);
      expect(reread?.standings[0].name).toBe("Ada");
      expect(reread?.questions).toHaveLength(2);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
