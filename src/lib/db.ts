import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Persistence is a single SQLite file under data/, opened in WAL mode (ADR-0003).
// data/ is gitignored and holds the DB (and, later, uploaded images).
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "quiz.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // Walking-skeleton proof table: a trivial place to read/write through SQLite.
  db.exec(`
    CREATE TABLE IF NOT EXISTS health (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      note       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}

// Writes one health row and reads back the running total — exercises the full
// read/write path through SQLite for the scaffold.
export function recordHealthCheck(note: string): { count: number; journalMode: string } {
  const conn = getDb();
  conn.prepare("INSERT INTO health (note) VALUES (?)").run(note);
  const { count } = conn.prepare("SELECT COUNT(*) AS count FROM health").get() as {
    count: number;
  };
  const journalMode = conn.pragma("journal_mode", { simple: true }) as string;
  return { count, journalMode };
}
