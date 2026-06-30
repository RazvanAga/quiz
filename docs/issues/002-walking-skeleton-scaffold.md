Issue: https://github.com/RazvanAga/quiz/issues/2

## What to build

Scaffold the single-process app and prove the whole stack end-to-end. A Next.js (App Router, TypeScript) app booted by a custom `server.js` that also attaches Socket.IO to the same HTTP server, with Tailwind and better-sqlite3 (WAL) wired in. Demonstrate one trivial path through every integration layer: a page that opens a Socket.IO connection and gets a reply, and a value read from / written to SQLite. Add an MIT license and gitignore `data/`.

See [ADR-0001](../adr/0001-nextjs-custom-server-socketio.md) and [ADR-0003](../adr/0003-sqlite-over-postgres.md).

## Acceptance criteria

- [ ] The documented start command runs Next + Socket.IO on one port as a single process
- [ ] A page establishes a Socket.IO connection and round-trips a ping/pong event
- [ ] better-sqlite3 opens a DB file in `data/` with `journal_mode = WAL`; a trivial read/write works
- [ ] Tailwind styles render
- [ ] MIT `LICENSE` present; `data/` (DB + uploads) gitignored
- [ ] Finish with a commit describing what was achieved

## Blocked by

None - can start immediately