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
const { createEngine, GRACE_MS } = require("./src/lib/game/engine.js");

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

  // Per-Game timers the adapter owns (PRD "Modules"): the answer countdown and
  // the all-answered grace. The engine stays timer-free; here we translate its
  // opensAt/closesAt and allAnswered signals into real setTimeouts.
  const timers = new Map(); // pin -> { close: Timeout|null, grace: Timeout|null }

  function clearTimers(pin) {
    const entry = timers.get(pin);
    if (!entry) return;
    if (entry.close) clearTimeout(entry.close);
    if (entry.grace) clearTimeout(entry.grace);
    timers.delete(pin);
  }

  // Close the Question on timer-zero.
  function scheduleClose(pin, closesAt) {
    clearTimers(pin);
    const delay = Math.max(0, closesAt - Date.now());
    timers.set(pin, { close: setTimeout(() => closeQuestion(pin), delay), grace: null });
  }

  // Every connected Player has answered: close after a short grace so a last tap
  // still lands (PRD story 35), unless the countdown beats it there first.
  function scheduleGrace(pin) {
    const entry = timers.get(pin);
    if (!entry || entry.grace) return; // no live Question, or grace already set
    entry.grace = setTimeout(() => closeQuestion(pin), GRACE_MS);
  }

  // Strip the correct Option before a Question reaches a Player's phone — the
  // Reveal is the only time the answer travels to Players.
  function sanitizeQuestion(q) {
    return {
      id: q.id,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      timeLimitSec: q.timeLimitSec,
      points: q.points,
    };
  }

  // Reveal a closed Question: correct Option + Distribution to the whole room
  // (Host screen and Player phones), plus each Player's own right/wrong + points
  // privately to their socket.
  async function revealToRoom(event) {
    io.to(room(event.pin)).emit("question:reveal", {
      index: event.index,
      correctOptionId: event.correctOptionId,
      distribution: event.distribution,
    });
    const resultById = Object.fromEntries(event.results.map((r) => [r.playerId, r]));
    const sockets = await io.in(room(event.pin)).fetchSockets();
    for (const s of sockets) {
      const r = resultById[s.data.playerId];
      if (r) {
        s.emit("you:result", {
          correct: r.correct,
          pointsGained: r.points,
          totalScore: r.totalScore,
        });
      }
    }
  }

  // Close the live Question and broadcast the Reveal. Idempotent in the engine,
  // so the countdown and the grace timer racing here is harmless.
  function closeQuestion(pin) {
    clearTimers(pin);
    const result = engine.closeQuestion(store, { pin });
    if (!result.ok) return;
    store = result.store;
    for (const event of result.events) {
      if (event.type === "questionClosed") revealToRoom(event);
    }
  }

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
      // Remember who this socket plays as, so the Reveal can address it privately.
      socket.data.playerId = String(playerId);
      socket.data.pin = result.game.pin;
      const you = result.game.players.find((p) => p.id === String(playerId));
      ack?.({ ok: true, you, players: result.game.players });

      // Let the Host screen and the other Player phones see the new roster live.
      for (const event of result.events) {
        if (event.type === "playerJoined") {
          io.to(room(event.pin)).emit("lobby:update", { players: event.players });
        }
      }
    });

    // Host clicks "Start": no more joins, and the first Question begins with its
    // intro beat. The Host client carries the Quiz's Questions (loaded server-side
    // on the Host page) and sends them here, correct Options and all — trusted,
    // since /admin is nginx-gated. We strip the answer before it reaches Players.
    socket.on("host:startGame", ({ pin, hostToken, questions } = {}, ack) => {
      const result = engine.startGame(store, {
        pin: String(pin || ""),
        hostToken: String(hostToken || ""),
        questions: Array.isArray(questions) ? questions : [],
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;
      ack?.({ ok: true });

      for (const event of result.events) {
        if (event.type === "questionStarted") {
          io.to(room(event.pin)).emit("question:begin", {
            index: event.index,
            question: sanitizeQuestion(event.question),
            introMs: Math.max(0, event.opensAt - Date.now()),
            answerMs: event.closesAt - event.opensAt,
            total: event.playerCount,
          });
          scheduleClose(event.pin, event.closesAt);
        }
      }
    });

    // A Player taps an Option: it locks instantly (first tap wins) and is scored
    // by the engine. The Host screen gets a live answered-count; the right/wrong
    // and points wait for the Reveal.
    socket.on("player:submitResponse", ({ pin, playerId, optionId } = {}, ack) => {
      const result = engine.submitResponse(store, {
        pin: String(pin || ""),
        playerId: String(playerId || ""),
        optionId: String(optionId || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;
      ack?.({ ok: true, locked: true });

      for (const event of result.events) {
        if (event.type === "responseRecorded") {
          io.to(room(event.pin)).emit("question:progress", {
            answered: event.answeredCount,
            total: event.connectedCount,
          });
        } else if (event.type === "allAnswered") {
          scheduleGrace(event.pin);
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
