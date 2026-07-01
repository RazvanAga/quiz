import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { GAME_RECORD_SCHEMA } from "./game-record-repository";

// Persistence is a single SQLite file under data/, opened in WAL mode (ADR-0003).
// data/ is gitignored and holds the DB (and, later, uploaded images).
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "quiz.db");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS quiz (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS question (
    id                TEXT PRIMARY KEY,
    quiz_id           TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
    position          INTEGER NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('single', 'truefalse')),
    text              TEXT NOT NULL DEFAULT '',
    image_url         TEXT,
    correct_option_id TEXT,
    time_limit_sec    INTEGER NOT NULL,
    points            INTEGER NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS option (
    id          TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    text        TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_question_quiz ON question(quiz_id, position);
  CREATE INDEX IF NOT EXISTS idx_option_question ON option(question_id, position);
`;

// Game Record tables (finished-Game History) live with their repository so the
// custom server can provision them over its own connection too (ADR-0002); the
// shared connection ensures them here so listQuizzes' last-played query works.
const FULL_SCHEMA = SCHEMA + GAME_RECORD_SCHEMA;

// Opens a SQLite connection at `filename` (a path, or ":memory:" for tests),
// enables WAL + foreign keys, and ensures the schema exists.
export function openDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(FULL_SCHEMA);
  return db;
}

let singleton: Database.Database | null = null;

// The app's shared connection, opened lazily against data/quiz.db.
export function getDb(): Database.Database {
  if (singleton) return singleton;
  mkdirSync(DATA_DIR, { recursive: true });
  singleton = openDatabase(DB_PATH);
  return singleton;
}
