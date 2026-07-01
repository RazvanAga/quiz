// Custom server: boots Next.js and attaches Socket.IO to the same HTTP server,
// so the whole app runs as one Node process on a single port (see ADR-0001).
//
// The Socket.IO adapter itself (PRD "Modules") — the thin layer translating
// socket messages into pure-engine commands and engine events into socket
// emits, owning the in-memory store of active Games (ADR-0002) — lives in
// ./src/lib/game/socket-adapter.js, extracted so a real Socket.IO client can
// smoke-test the wiring (Seam 3). This file just wires it to the HTTP server,
// running it in the long-lived custom server rather than a Next Server Action
// (whose module scope is separate and can't hold live state or push to clients).
const { createServer } = require("node:http");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const next = require("next");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const { attachGameSockets } = require("./src/lib/game/socket-adapter.js");
const { createGameRecordRepository } = require("./src/lib/game-record-repository.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// The adapter's own SQLite connection for persisting finished Games (ADR-0002).
// Separate from Next's shared connection — different module systems, same WAL
// file — which is safe under WAL. The repository ensures its own schema.
const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const recordDb = new Database(path.join(dataDir, "quiz.db"));
recordDb.pragma("journal_mode = WAL");
recordDb.pragma("foreign_keys = ON");
const gameRecords = createGameRecordRepository(recordDb);

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);

  // Attach the Game socket adapter (all handlers, timers, and idle-GC live in
  // its own module now so a real Socket.IO client can smoke-test it — Seam 3).
  attachGameSockets(io, { gameRecords });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port} (Next + Socket.IO)`);
    });
});
