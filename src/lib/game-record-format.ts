// Format a Game Record's stored date for the History views. SQLite writes
// played_at via datetime('now') as a UTC "YYYY-MM-DD HH:MM:SS" string; we show
// it to the minute, deterministically (no locale/timezone shift), so a server
// component renders the same string every time.
export function formatPlayedAt(playedAt: string): string {
  // Drop seconds: "2026-07-01 10:31:27" → "2026-07-01 10:31".
  return playedAt.slice(0, 16);
}
