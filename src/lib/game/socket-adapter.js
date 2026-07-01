// The Socket.IO adapter (PRD "Modules"): a thin layer translating socket
// messages into pure-engine commands and engine events into socket emits. It
// owns the single in-memory store of active Games keyed by Game PIN (ADR-0002)
// and the per-Game real timers the timer-free engine can't hold.
//
// Extracted from server.js so the wiring can be exercised end-to-end by a real
// Socket.IO client in the Seam-3 smoke tests, without booting Next.js. server.js
// attaches it to the shared HTTP server; a test attaches it to a bare one.
const {
  createEngine,
  buildGameRecord,
  rankStandings,
  GRACE_MS,
  IDLE_GC_MS,
} = require("./engine.js");

/**
 * Wire every Game socket handler onto an io Server. The caller supplies the
 * Game Record repository (real SQLite in production, an in-memory fake in
 * tests) and may inject an engine with a controlled clock/PIN.
 *
 * @param {import("socket.io").Server} io
 * @param {{ gameRecords: { saveGameRecord: (record: unknown) => unknown }, engine?: ReturnType<typeof createEngine> }} deps
 * @returns {{ close: () => void }} stops the idle-GC interval and clears pending timers
 */
function attachGameSockets(io, { gameRecords, engine = createEngine() } = {}) {
  // The live set of active Games, keyed by Game PIN. The engine treats this as
  // immutable input and returns the next store; we keep the latest reference.
  let store = {};

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

  // A snapshot of a Game's current phase, so a reconnecting Host or Player can
  // resume mid-Game (not just in the Lobby): enough to repaint whatever screen
  // the Game is on. The engine keeps the live state; this shapes it for the
  // client the same way the live events do (question sanitized, windows in ms).
  function resumeState(game) {
    /** @type {Record<string, unknown>} */
    const state = { status: game.status, players: game.players };
    if (game.status === "question") {
      const q = game.questions[game.currentIndex];
      const nowMs = Date.now();
      const introMs = Math.max(0, game.opensAt - nowMs);
      // Once the intro beat has passed, the countdown resumes from its remainder.
      const answerMs =
        introMs > 0 ? game.closesAt - game.opensAt : Math.max(0, game.closesAt - nowMs);
      state.question = sanitizeQuestion(q);
      state.index = game.currentIndex;
      state.introMs = introMs;
      state.answerMs = answerMs;
      state.answered = Object.keys(game.responses).length;
      state.total = game.players.filter((p) => p.connected).length;
    } else if (game.status === "reveal") {
      const q = game.questions[game.currentIndex];
      const round = game.rounds[game.rounds.length - 1];
      state.question = sanitizeQuestion(q);
      state.index = game.currentIndex;
      state.reveal = {
        index: game.currentIndex,
        correctOptionId: q.correctOptionId,
        distribution: round.distribution,
      };
    } else if (game.status === "leaderboard") {
      state.leaderboard = {
        index: game.currentIndex,
        standings: rankStandings(game.players),
        hasNext: game.currentIndex + 1 < game.questions.length,
      };
    } else if (game.status === "podium") {
      state.podium = { standings: rankStandings(game.players) };
    }
    return state;
  }

  // The Player's view of a resume adds their own private outcome at the Reveal
  // (right/wrong + points), which the room-wide snapshot can't carry, plus the
  // Option they had locked in so the phone re-highlights it.
  function playerResumeState(game, playerId) {
    const state = resumeState(game);
    if (game.status === "reveal") {
      const round = game.rounds[game.rounds.length - 1];
      const r = round.responses.find((x) => x.playerId === playerId);
      const p = game.players.find((x) => x.id === playerId);
      state.chosen = r ? r.optionId : null;
      state.youResult = {
        correct: r ? r.correct : false,
        pointsGained: r ? r.points : 0,
        totalScore: p ? p.score : 0,
      };
    }
    return state;
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

    // Host screen mounts, recovers from a blip, or reloads mid-Game: the host
    // token (minted at createGame, kept in the Host's localStorage) proves it's
    // the real Host, then we re-attach the socket to the room and hand back a
    // snapshot so it resumes on whatever screen the Game is on (#9).
    socket.on("host:reconnect", ({ pin, hostToken } = {}, ack) => {
      const result = engine.hostReconnect(store, {
        pin: String(pin || ""),
        hostToken: String(hostToken || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;
      socket.join(room(result.game.pin));
      socket.data.pin = result.game.pin;
      ack?.({ ok: true, snapshot: resumeState(result.game) });
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

    // A Player's client reconnects after a blip or a reload: re-attach their
    // localStorage playerId to this new socket, preserving score and rank, and
    // hand back a snapshot so a reloaded phone resumes mid-Game (PRD story 46).
    socket.on("player:reconnect", ({ pin, playerId } = {}, ack) => {
      const result = engine.playerReconnect(store, {
        pin: String(pin || ""),
        playerId: String(playerId || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;

      socket.join(room(result.game.pin));
      socket.data.playerId = String(playerId);
      socket.data.pin = result.game.pin;
      const you = result.game.players.find((p) => p.id === String(playerId));
      ack?.({ ok: true, you, snapshot: playerResumeState(result.game, String(playerId)) });

      // The Host (and other phones) see them light back up in the roster.
      for (const event of result.events) {
        if (event.type === "playerReconnected") {
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

    // Host clicks "Next": from a Reveal, show the interim Leaderboard; from that
    // Leaderboard, open the next Question with its intro beat and countdown. The
    // engine owns which transition applies; we just fan its events out.
    socket.on("host:advance", ({ pin, hostToken } = {}, ack) => {
      const result = engine.advance(store, {
        pin: String(pin || ""),
        hostToken: String(hostToken || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;
      ack?.({ ok: true });

      for (const event of result.events) {
        if (event.type === "leaderboard") {
          io.to(room(event.pin)).emit("game:leaderboard", {
            index: event.index,
            standings: event.standings,
            hasNext: event.hasNext,
          });
        } else if (event.type === "questionStarted") {
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

    // Host clicks "Finish" after the last Question: end the Game and show the
    // final Podium (full ranking) to the whole room. On the real finish (the
    // idempotent second finish emits nothing) we write one Game Record with the
    // Podium, Distributions, and per-Player per-Question detail, then evict the
    // in-memory Game and free its PIN (ADR-0002).
    socket.on("host:finish", ({ pin, hostToken } = {}, ack) => {
      const result = engine.finish(store, {
        pin: String(pin || ""),
        hostToken: String(hostToken || ""),
      });
      if (!result.ok) return ack?.({ ok: false, error: result.error });
      store = result.store;
      clearTimers(String(pin || ""));
      ack?.({ ok: true });

      for (const event of result.events) {
        if (event.type === "gameFinished") {
          io.to(room(event.pin)).emit("game:podium", { standings: event.standings });

          try {
            gameRecords.saveGameRecord(buildGameRecord(result.game));
          } catch (err) {
            // A failed write must not crash the server or the Podium; log and
            // keep the finished Game in memory rather than evicting unpersisted.
            console.error(`Failed to persist Game Record for PIN ${event.pin}`, err);
            break;
          }

          const { [event.pin]: _evicted, ...rest } = store;
          store = rest;
        }
      }
    });

    // A socket drops (tab closed, network blip, phone locked). If it belonged to
    // a Player, flag them disconnected so the Host sees them greyed out — but
    // never remove them, so a reconnect restores their score and rank (#9). A
    // brief blip often reconnects on a fresh socket before this fires; if another
    // live socket is already playing as them, there's nothing to flag. Host
    // sockets carry no playerId, so a Host drop flags nobody (it resumes via
    // host token).
    socket.on("disconnect", async () => {
      const { pin, playerId } = socket.data || {};
      if (!pin || !playerId) return;
      const sockets = await io.in(room(pin)).fetchSockets();
      const stillConnected = sockets.some(
        (s) => s.id !== socket.id && s.data.playerId === playerId,
      );
      if (stillConnected) return;

      const result = engine.markDisconnected(store, { pin, playerId });
      if (!result.ok) return;
      store = result.store;
      for (const event of result.events) {
        if (event.type === "playerDisconnected") {
          io.to(room(event.pin)).emit("lobby:update", { players: event.players });
        }
      }
    });
  });

  // Idle-timeout GC (ADR-0002): every minute, reclaim in-memory Games no one has
  // touched in IDLE_GC_MS — a Host who walked away, a Lobby everyone left — and
  // free their PINs. Their answer/grace timers are cleared so nothing fires for
  // an evicted Game. Abandoned Games never reached the Podium, so nothing was
  // persisted; we simply drop them.
  const gcInterval = setInterval(() => {
    const { store: swept, evictedPins } = engine.gcIdleGames(store, { idleMs: IDLE_GC_MS });
    if (evictedPins.length === 0) return;
    store = swept;
    for (const pin of evictedPins) {
      clearTimers(pin);
      console.log(`Idle-GC reclaimed Game ${pin}`);
    }
  }, 60 * 1000);
  gcInterval.unref();

  // Tear-down for tests: stop the GC heartbeat and any pending answer/grace
  // timers so the process can exit cleanly between suites.
  return {
    close() {
      clearInterval(gcInterval);
      for (const pin of [...timers.keys()]) clearTimers(pin);
    },
  };
}

module.exports = { attachGameSockets };
