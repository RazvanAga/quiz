// The Game Record repository (docs/CONTEXT.md): the finished Games in a Quiz's
// History. One Game Record is written when a Game reaches its Podium — its date,
// the final Podium standings, each Question's Distribution, and every Player's
// per-Question Responses. Abandoned Games never finish, so they write nothing
// (ADR-0002).
//
// Written in plain CommonJS, like the engine, so the custom server (server.js,
// run by plain `node`) can require it to persist a finished Game, while the Next
// app (History pages) and the Vitest suite import it as a typed module via the
// JSDoc typedefs. A finished Game is distilled by engine.buildGameRecord into
// the GameRecordInput this accepts.

const { randomUUID } = require("node:crypto");

// A Game Record fans out over five tables so it can be read back at the grain the
// History detail view needs (Podium, per-Question Distribution, per-Player
// per-Question drill-down). Question text and Options are denormalised into the
// record so later edits or deletion of the Quiz's Questions never rewrite
// History. The record is scoped to its Quiz and cascades if the Quiz is deleted.
const GAME_RECORD_SCHEMA = `
  CREATE TABLE IF NOT EXISTS game_record (
    id           TEXT PRIMARY KEY,
    quiz_id      TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
    pin          TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    played_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_standing (
    id             TEXT PRIMARY KEY,
    game_record_id TEXT NOT NULL REFERENCES game_record(id) ON DELETE CASCADE,
    player_id      TEXT NOT NULL,
    name           TEXT NOT NULL,
    avatar         TEXT NOT NULL,
    score          INTEGER NOT NULL,
    rank           INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_question (
    id                TEXT PRIMARY KEY,
    game_record_id    TEXT NOT NULL REFERENCES game_record(id) ON DELETE CASCADE,
    position          INTEGER NOT NULL,
    question_id       TEXT NOT NULL,
    type              TEXT NOT NULL,
    text              TEXT NOT NULL,
    correct_option_id TEXT NOT NULL,
    points            INTEGER NOT NULL,
    time_limit_sec    INTEGER NOT NULL,
    no_answer         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_question_option (
    id               TEXT PRIMARY KEY,
    game_question_id TEXT NOT NULL REFERENCES game_question(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    option_id        TEXT NOT NULL,
    text             TEXT NOT NULL,
    count            INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_response (
    id               TEXT PRIMARY KEY,
    game_question_id TEXT NOT NULL REFERENCES game_question(id) ON DELETE CASCADE,
    player_id        TEXT NOT NULL,
    option_id        TEXT,
    time_used        INTEGER,
    correct          INTEGER NOT NULL,
    points           INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_game_record_quiz ON game_record(quiz_id, played_at);
  CREATE INDEX IF NOT EXISTS idx_game_standing_record ON game_standing(game_record_id, rank);
  CREATE INDEX IF NOT EXISTS idx_game_question_record ON game_question(game_record_id, position);
  CREATE INDEX IF NOT EXISTS idx_game_question_option ON game_question_option(game_question_id, position);
  CREATE INDEX IF NOT EXISTS idx_game_response_question ON game_response(game_question_id);
`;

/**
 * A row of the History list for one Quiz: enough to show the date, how many
 * Players played, and who won without loading the whole record.
 * @typedef {Object} GameRecordSummary
 * @property {string} id
 * @property {string} playedAt
 * @property {number} playerCount
 * @property {number} questionCount
 * @property {string | null} winnerName  the rank-1 Player, or null if none
 */

/**
 * One Player's Response to one Question inside a read-back Game Record.
 * @typedef {Object} RecordResponse
 * @property {string} playerId
 * @property {string | null} optionId
 * @property {number | null} timeUsed
 * @property {boolean} correct
 * @property {number} points
 */

/**
 * One Question inside a read-back Game Record: its frozen text and Options
 * (each carrying its Distribution count), plus every Player's Response.
 * @typedef {Object} RecordQuestion
 * @property {number} position
 * @property {string} questionId
 * @property {"single" | "truefalse"} type
 * @property {string} text
 * @property {string} correctOptionId
 * @property {number} points
 * @property {number} timeLimitSec
 * @property {number} noAnswer
 * @property {{ optionId: string, text: string, count: number }[]} options
 * @property {RecordResponse[]} responses
 */

/**
 * A fully read-back Game Record: its meta, the final Podium standings, and every
 * Question's Distribution and per-Player Responses.
 * @typedef {Object} GameRecordDetail
 * @property {string} id
 * @property {string} quizId
 * @property {string} pin
 * @property {string} playedAt
 * @property {number} playerCount
 * @property {{ playerId: string, name: string, avatar: string, score: number, rank: number }[]} standings
 * @property {RecordQuestion[]} questions
 */

/**
 * @typedef {Object} GameRecordRepository
 * @property {(record: import("./game/engine").GameRecordInput) => string} saveGameRecord
 * @property {(quizId: string) => GameRecordSummary[]} listGameRecords
 * @property {(id: string) => GameRecordDetail | null} getGameRecord
 */

/**
 * Create a Game Record repository over a better-sqlite3 connection. The
 * connection may be the app's shared one (History pages) or the custom server's
 * own (persisting on finish); either way the schema is ensured here so the
 * caller needn't know about it.
 * @param {import("better-sqlite3").Database} db
 * @returns {GameRecordRepository}
 */
function createGameRecordRepository(db) {
  db.exec(GAME_RECORD_SCHEMA);

  const insertRecord = db.prepare(
    "INSERT INTO game_record (id, quiz_id, pin, player_count) VALUES (?, ?, ?, ?)",
  );
  const insertStanding = db.prepare(
    `INSERT INTO game_standing (id, game_record_id, player_id, name, avatar, score, rank)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertQuestion = db.prepare(
    `INSERT INTO game_question
       (id, game_record_id, position, question_id, type, text, correct_option_id, points, time_limit_sec, no_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertOption = db.prepare(
    `INSERT INTO game_question_option (id, game_question_id, position, option_id, text, count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertResponse = db.prepare(
    `INSERT INTO game_response (id, game_question_id, player_id, option_id, time_used, correct, points)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    saveGameRecord(record) {
      const recordId = randomUUID();
      const write = db.transaction(() => {
        insertRecord.run(recordId, record.quizId, record.pin, record.playerCount);

        for (const s of record.standings) {
          insertStanding.run(
            randomUUID(),
            recordId,
            s.playerId,
            s.name,
            s.avatar,
            s.score,
            s.rank,
          );
        }

        for (const round of record.rounds) {
          const questionId = randomUUID();
          insertQuestion.run(
            questionId,
            recordId,
            round.index,
            round.questionId,
            round.type,
            round.text,
            round.correctOptionId,
            round.points,
            round.timeLimitSec,
            round.distribution.noAnswer,
          );

          const countByOption = new Map(
            round.distribution.counts.map((c) => [c.optionId, c.count]),
          );
          round.options.forEach((o, i) => {
            insertOption.run(
              randomUUID(),
              questionId,
              i,
              o.id,
              o.text,
              countByOption.get(o.id) ?? 0,
            );
          });

          for (const r of round.responses) {
            insertResponse.run(
              randomUUID(),
              questionId,
              r.playerId,
              r.optionId,
              r.timeUsed,
              r.correct ? 1 : 0,
              r.points,
            );
          }
        }
      });
      write();
      return recordId;
    },

    listGameRecords(quizId) {
      const rows = db
        .prepare(
          `SELECT gr.id, gr.played_at, gr.player_count,
                  (SELECT COUNT(*) FROM game_question WHERE game_record_id = gr.id) AS question_count,
                  (SELECT name FROM game_standing
                     WHERE game_record_id = gr.id AND rank = 1
                     ORDER BY name LIMIT 1) AS winner_name
           FROM game_record gr
           WHERE gr.quiz_id = ?
           ORDER BY gr.played_at DESC, gr.rowid DESC`,
        )
        .all(quizId);
      return rows.map((r) => ({
        id: r.id,
        playedAt: r.played_at,
        playerCount: r.player_count,
        questionCount: r.question_count,
        winnerName: r.winner_name ?? null,
      }));
    },

    getGameRecord(id) {
      const record = db.prepare("SELECT * FROM game_record WHERE id = ?").get(id);
      if (!record) return null;

      const standings = db
        .prepare(
          "SELECT * FROM game_standing WHERE game_record_id = ? ORDER BY rank, name",
        )
        .all(id)
        .map((s) => ({
          playerId: s.player_id,
          name: s.name,
          avatar: s.avatar,
          score: s.score,
          rank: s.rank,
        }));

      const questionRows = db
        .prepare(
          "SELECT * FROM game_question WHERE game_record_id = ? ORDER BY position",
        )
        .all(id);

      const questions = questionRows.map((q) => {
        const options = db
          .prepare(
            "SELECT * FROM game_question_option WHERE game_question_id = ? ORDER BY position",
          )
          .all(q.id)
          .map((o) => ({ optionId: o.option_id, text: o.text, count: o.count }));
        const responses = db
          .prepare("SELECT * FROM game_response WHERE game_question_id = ?")
          .all(q.id)
          .map((r) => ({
            playerId: r.player_id,
            optionId: r.option_id,
            timeUsed: r.time_used,
            correct: r.correct === 1,
            points: r.points,
          }));
        return {
          position: q.position,
          questionId: q.question_id,
          type: q.type,
          text: q.text,
          correctOptionId: q.correct_option_id,
          points: q.points,
          timeLimitSec: q.time_limit_sec,
          noAnswer: q.no_answer,
          options,
          responses,
        };
      });

      return {
        id: record.id,
        quizId: record.quiz_id,
        pin: record.pin,
        playedAt: record.played_at,
        playerCount: record.player_count,
        standings,
        questions,
      };
    },
  };
}

module.exports = { createGameRecordRepository, GAME_RECORD_SCHEMA };
