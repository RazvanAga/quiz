// Custom server: boots Next.js and attaches Socket.IO to the same HTTP server,
// so the whole app runs as one Node process on a single port (see ADR-0001).
//
// This is also the Socket.IO adapter (PRD "Modules"): a thin layer translating
// socket messages into pure-engine commands and engine events into socket
// emits. It owns the single in-memory store of active Games keyed by Game PIN
// (ADR-0002) — kept here, in the long-lived custom server, rather than in a
// Next Server Action (whose module scope is separate and can't hold live state
// or push to clients). Real timers and the question lifecycle arrive in #6+.
const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");
const { createEngine } = require("./src/lib/game/engine.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const engine = createEngine();
// The live set of active Games, keyed by Game PIN. The engine treats this as
// immutable input and returns the next store; we keep the latest reference.
let store = {};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);

  // The room name every participant of one Game shares, so a roster change is
  // broadcast to the Host screen and all Player phones at once.
  const room = (pin) => `game:${pin}`;

  io.on("connection", (socket) => {
    // Admin clicks "Start game": create a Game from a Quiz and return its PIN.
    socket.on("host:createGame", ({ quizId, hostToken } = {}, ack) => {
      const result = engine.createGame(store, {
        quizId: String(quizId || ""),
        hostToken: String(hostToken || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;
      socket.join(room(result.game.pin));
      ack?.({ ok: true, pin: result.game.pin });
    });

    // Host screen mounts (or recovers): attach to its Game and get the roster.
    socket.on("host:attach", ({ pin } = {}, ack) => {
      const game = store[String(pin || "")];
      if (!game) return ack?.({ ok: false, error: "That Game is no longer active." });
      socket.join(room(game.pin));
      ack?.({ ok: true, players: game.players });
    });

    // Player joins a Game's Lobby by PIN with a display name and Avatar.
    socket.on("player:join", ({ pin, playerId, name, avatar } = {}, ack) => {
      const result = engine.playerJoin(store, {
        pin: String(pin || ""),
        playerId: String(playerId || ""),
        name: String(name || ""),
        avatar: String(avatar || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;

      socket.join(room(result.game.pin));
      const you = result.game.players.find((p) => p.id === String(playerId));
      ack?.({ ok: true, you, players: result.game.players });

      // Let the Host screen and the other Player phones see the new roster live.
      for (const event of result.events) {
        if (event.type === "playerJoined") {
          io.to(room(event.pin)).emit("lobby:update", { players: event.players });
        }
      }
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port} (Next + Socket.IO)`);
    });
});
