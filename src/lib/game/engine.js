// Seam 1: the pure, transport-free Game engine (ADR-0002). It owns the live
// Game state and its lifecycle, accepting domain commands and returning the
// next state plus a list of events to emit. It knows nothing about sockets,
// timers, or SQLite. A clock (now) and the PIN generator are injected so timing
// and PIN collision-retry are deterministic under test.
//
// Written in plain CommonJS so the custom server (server.js, run by plain
// `node`) can require it directly while the Vitest suite imports it as a typed
// module via the JSDoc typedefs below. Vocabulary follows docs/CONTEXT.md.

/**
 * A Player in one Game, keyed by a client-generated playerId (a UUID kept in
 * the browser's localStorage), not the socket id, so a reconnecting client
 * re-attaches to the same Player (full reconnection lands in #9).
 * @typedef {Object} Player
 * @property {string} id         client-generated playerId
 * @property {string} name       display name, unique per Game (trimmed)
 * @property {string} avatar     chosen preset Avatar id
 * @property {boolean} connected
 * @property {number} joinedAt   ms epoch from the injected now()
 * @property {number} score      running total across answered Questions
 */

/**
 * The Game lifecycle (PRD state machine). #5 built the lobby; #6 played one
 * Question end-to-end; #7 turns that into a full Game: `question` covers the
 * intro beat and the open answering window (options become tappable at
 * `opensAt`), `reveal` shows the correct Option and the Distribution, then the
 * Host advances to the interim `leaderboard`, and after the last Question the
 * Game reaches its final `podium`. State stays in memory (ADR-0002); persisting
 * the finished Game as a Game Record lands in #8.
 * @typedef {"lobby" | "question" | "reveal" | "leaderboard" | "podium"} GameStatus
 */

/**
 * A Question as the engine plays it — the authored shape (docs/CONTEXT.md) the
 * adapter passes in at startGame, correct Option and all. The adapter strips
 * `correctOptionId` before anything reaches a Player's phone.
 * @typedef {Object} EngineQuestion
 * @property {string} id
 * @property {"single" | "truefalse"} type
 * @property {string} text
 * @property {string | null} imageUrl
 * @property {{ id: string, text: string }[]} options
 * @property {string} correctOptionId
 * @property {number} timeLimitSec
 * @property {number} points
 */

/**
 * One Player's Response to the current Question (docs/CONTEXT.md): the Option
 * picked, how long they took from `opensAt`, whether it was correct, and the
 * time-scaled points earned. Runtime only.
 * @typedef {Object} Response
 * @property {string} optionId
 * @property {number} timeUsed  ms from opensAt to the tap, clamped to [0, limit]
 * @property {boolean} correct
 * @property {number} points
 * @property {number} at        ms epoch of the tap
 */

/**
 * One live play-through of a Quiz, held in memory and keyed by its Game PIN.
 * @typedef {Object} Game
 * @property {string} pin        4-digit Game PIN (0000-9999)
 * @property {string} quizId
 * @property {string} hostToken  opaque token the Host re-sends to resume (#9)
 * @property {GameStatus} status
 * @property {Player[]} players
 * @property {number} createdAt  ms epoch from the injected now()
 * @property {number} lastActivityAt  ms epoch of the last command that touched this Game, for the idle-timeout GC (#9)
 * @property {EngineQuestion[]} questions   the Quiz's Questions, set at startGame
 * @property {number} currentIndex          index of the live Question (-1 in lobby)
 * @property {number | null} opensAt         ms epoch Options become tappable
 * @property {number | null} closesAt        ms epoch the timer hits zero
 * @property {Object.<string, Response>} responses  by playerId, for the live Question
 * @property {RoundRecord[]} rounds  one per closed Question, accumulated for the Game Record (#8)
 */

/**
 * The frozen record of one closed Question, kept so the finished Game can be
 * persisted with its full per-Question detail (docs/CONTEXT.md Game Record).
 * The live Game discards each Question's Responses when it opens the next one,
 * so closeQuestion snapshots them here as it reveals.
 * @typedef {Object} RoundRecord
 * @property {number} index
 * @property {string} questionId
 * @property {"single" | "truefalse"} type
 * @property {string} text
 * @property {{ id: string, text: string }[]} options
 * @property {string} correctOptionId
 * @property {number} points
 * @property {number} timeLimitSec
 * @property {Distribution} distribution
 * @property {{ playerId: string, optionId: string | null, timeUsed: number | null, correct: boolean, points: number }[]} responses  one per Player who was in the Game
 */

/**
 * A finished Game distilled into the shape the Game Record repository persists:
 * its date comes from the DB, the Podium standings and every Question's
 * Distribution and per-Player Responses come from here.
 * @typedef {Object} GameRecordInput
 * @property {string} quizId
 * @property {string} pin
 * @property {number} playerCount
 * @property {Standing[]} standings   the final Podium
 * @property {RoundRecord[]} rounds
 */

/**
 * The set of active Games, keyed by Game PIN. The Socket.IO adapter holds one
 * of these and threads it through engine calls (the engine never mutates it).
 * @typedef {Object.<string, Game>} GameStore
 */

/**
 * The Distribution of Responses across a Question's Options (docs/CONTEXT.md),
 * in Option order, plus how many Players never answered.
 * @typedef {{ counts: { optionId: string, count: number }[], noAnswer: number }} Distribution
 */

/**
 * One Player's outcome for the closed Question, as the Reveal reports it.
 * @typedef {Object} QuestionResult
 * @property {string} playerId
 * @property {string | null} optionId    the Option picked, or null if unanswered
 * @property {boolean} correct
 * @property {number} points              points gained this Question
 * @property {number | null} timeUsed
 * @property {number} totalScore          running total after this Question
 */

/**
 * One row of a ranked standing — an interim Leaderboard or the final Podium.
 * Ranks use standard competition ordering (ties share a rank; the next rank
 * skips), highest score first.
 * @typedef {Object} Standing
 * @property {string} playerId
 * @property {string} name
 * @property {string} avatar
 * @property {number} score
 * @property {number} rank    1-based
 */

/**
 * An event the adapter should emit over Socket.IO in response to a command.
 * @typedef {{ type: "gameCreated", pin: string }
 *   | { type: "playerJoined", pin: string, player: Player, players: Player[] }
 *   | { type: "playerReconnected", pin: string, player: Player, players: Player[] }
 *   | { type: "playerDisconnected", pin: string, player: Player, players: Player[] }
 *   | { type: "questionStarted", pin: string, index: number, question: EngineQuestion, opensAt: number, closesAt: number, playerCount: number }
 *   | { type: "responseRecorded", pin: string, playerId: string, answeredCount: number, connectedCount: number }
 *   | { type: "allAnswered", pin: string }
 *   | { type: "questionClosed", pin: string, index: number, correctOptionId: string, distribution: Distribution, results: QuestionResult[], players: Player[] }
 *   | { type: "leaderboard", pin: string, index: number, standings: Standing[], hasNext: boolean }
 *   | { type: "gameFinished", pin: string, standings: Standing[] }} GameEvent
 */

/**
 * The outcome of a command: either the next store plus the affected Game and
 * the events to emit, or a rejection carrying a player-facing message.
 * @typedef {{ ok: true, store: GameStore, game: Game, events: GameEvent[] }
 *   | { ok: false, error: string }} CommandResult
 */

/**
 * @typedef {Object} Engine
 * @property {(store: GameStore, cmd: { quizId: string, hostToken: string }) => CommandResult} createGame
 * @property {(store: GameStore, cmd: { pin: string, playerId: string, name: string, avatar: string }) => CommandResult} playerJoin
 * @property {(store: GameStore, cmd: { pin: string, playerId: string }) => CommandResult} playerReconnect
 * @property {(store: GameStore, cmd: { pin: string, hostToken: string }) => CommandResult} hostReconnect
 * @property {(store: GameStore, cmd: { pin: string, playerId: string }) => CommandResult} markDisconnected
 * @property {(store: GameStore, cmd: { pin: string, hostToken: string, questions: EngineQuestion[], introMs?: number }) => CommandResult} startGame
 * @property {(store: GameStore, cmd: { pin: string, playerId: string, optionId: string }) => CommandResult} submitResponse
 * @property {(store: GameStore, cmd: { pin: string }) => CommandResult} closeQuestion
 * @property {(store: GameStore, cmd: { pin: string, hostToken: string }) => CommandResult} advance
 * @property {(store: GameStore, cmd: { pin: string, hostToken: string }) => CommandResult} finish
 * @property {(store: GameStore, cmd: { idleMs: number }) => { store: GameStore, evictedPins: string[] }} gcIdleGames
 */

/** Generate a random 4-digit Game PIN, e.g. "0042". */
function randomPin() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

const TOTAL_PINS = 10000;

// The intro beat: how long a Question's text (and image) show before its Options
// become tappable (PRD story 29). The answering countdown starts at opensAt.
const DEFAULT_INTRO_MS = 4000;

// Once every connected Player has answered, the Question stays open a short
// grace so a last tap still lands before the Reveal (PRD story 35). Owned by the
// adapter's timers, but the constant lives with the engine so both agree.
const GRACE_MS = 2000;

// How long a Game may sit with no command touching it before the idle-timeout
// GC reclaims it and frees its PIN (ADR-0002). Long enough that a real Game
// between Questions is never mistaken for abandoned; short enough that a Host
// who walked away doesn't hold a PIN forever. Owned conceptually by the engine
// (gcIdleGames); the adapter runs the sweep on an interval.
const IDLE_GC_MS = 30 * 60 * 1000;

/** Clamp n into [min, max]. */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Rank Players into a standing (interim Leaderboard or final Podium): highest
 * score first, ties broken by name for a stable order, with standard
 * competition ranks (ties share a rank, the next rank skips accordingly).
 * @param {Player[]} players
 * @returns {Standing[]}
 */
function rankStandings(players) {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
  let rank = 0;
  let prevScore = null;
  return sorted.map((p, i) => {
    if (p.score !== prevScore) {
      rank = i + 1;
      prevScore = p.score;
    }
    return { playerId: p.id, name: p.name, avatar: p.avatar, score: p.score, rank };
  });
}

/**
 * Distill a finished Game into the Game Record the repository persists: its
 * Podium standings plus every closed Question's Distribution and per-Player
 * Responses (docs/CONTEXT.md). Pure — the adapter calls this on `gameFinished`
 * and hands the result to the store, then evicts the in-memory Game (ADR-0002).
 * @param {Game} game
 * @returns {GameRecordInput}
 */
function buildGameRecord(game) {
  return {
    quizId: game.quizId,
    pin: game.pin,
    playerCount: game.players.length,
    standings: rankStandings(game.players),
    rounds: game.rounds,
  };
}

/**
 * Create an engine bound to its injected dependencies.
 * @param {{ now?: () => number, newPin?: () => string }} [deps]
 */
function createEngine(deps = {}) {
  const now = deps.now || Date.now;
  const newPin = deps.newPin || randomPin;

  /**
   * Allocate a Game PIN not already held by an active Game, retrying on
   * collision. Throws only if every PIN is taken (far beyond real use).
   * @param {GameStore} store
   * @returns {string}
   */
  function allocatePin(store) {
    for (let attempt = 0; attempt < TOTAL_PINS * 10; attempt++) {
      const pin = newPin();
      if (!(pin in store)) return pin;
    }
    throw new Error("No free Game PIN is available");
  }

  /**
   * Open the Question at `index` on `game`: schedule its intro/answer windows
   * off the injected clock and produce the questionStarted event. Shared by
   * startGame (first Question) and advance (each subsequent Question) so both
   * open a Question the same way.
   * @param {Game} game
   * @param {number} index
   * @param {number} [introMs]
   * @returns {{ next: Game, event: GameEvent }}
   */
  function beginQuestion(game, index, introMs) {
    const question = game.questions[index];
    const startedAt = now();
    const opensAt = startedAt + (introMs ?? DEFAULT_INTRO_MS);
    const closesAt = opensAt + question.timeLimitSec * 1000;
    /** @type {Game} */
    const next = {
      ...game,
      status: "question",
      currentIndex: index,
      opensAt,
      closesAt,
      responses: {},
      lastActivityAt: startedAt,
    };
    return {
      next,
      event: {
        type: "questionStarted",
        pin: game.pin,
        index,
        question,
        opensAt,
        closesAt,
        playerCount: game.players.length,
      },
    };
  }

  return {
    /**
     * Start a new Game from a Quiz: mint a unique PIN and open its Lobby.
     * @param {GameStore} store
     * @param {{ quizId: string, hostToken: string }} cmd
     * @returns {CommandResult}
     */
    createGame(store, { quizId, hostToken }) {
      const pin = allocatePin(store);
      const at = now();
      /** @type {Game} */
      const game = {
        pin,
        quizId,
        hostToken,
        status: "lobby",
        players: [],
        createdAt: at,
        lastActivityAt: at,
        questions: [],
        currentIndex: -1,
        opensAt: null,
        closesAt: null,
        responses: {},
        rounds: [],
      };
      return {
        ok: true,
        store: { ...store, [pin]: game },
        game,
        events: [{ type: "gameCreated", pin }],
      };
    },

    /**
     * A Player joins a Game's Lobby by PIN with a display name and Avatar.
     * Names are unique per Game; a wrong/expired PIN or duplicate name is
     * rejected with a clear, player-facing message. Re-joining with the same
     * playerId is idempotent so a reconnecting client is not duplicated.
     * @param {GameStore} store
     * @param {{ pin: string, playerId: string, name: string, avatar: string }} cmd
     * @returns {CommandResult}
     */
    playerJoin(store, { pin, playerId, name, avatar }) {
      const game = store[pin];
      if (!game) {
        return { ok: false, error: "No Game found for that PIN. Check it and try again." };
      }
      if (game.status !== "lobby") {
        return { ok: false, error: "This Game has already started — you can't join now." };
      }

      const trimmedName = name.trim();
      if (!trimmedName) return { ok: false, error: "Enter a display name to join." };
      if (!avatar) return { ok: false, error: "Pick an Avatar to join." };

      const existing = game.players.find((p) => p.id === playerId);
      if (existing) {
        // Idempotent re-join: re-attach this Player rather than duplicating it.
        const players = game.players.map((p) =>
          p.id === playerId ? { ...p, connected: true } : p,
        );
        const next = { ...game, players, lastActivityAt: now() };
        return {
          ok: true,
          store: { ...store, [pin]: next },
          game: next,
          events: [{ type: "playerJoined", pin, player: players.find((p) => p.id === playerId), players }],
        };
      }

      const nameTaken = game.players.some(
        (p) => p.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (nameTaken) {
        return { ok: false, error: `The name "${trimmedName}" is already taken in this Game.` };
      }

      const joinedAt = now();
      /** @type {Player} */
      const player = {
        id: playerId,
        name: trimmedName,
        avatar,
        connected: true,
        joinedAt,
        score: 0,
      };
      const players = [...game.players, player];
      const next = { ...game, players, lastActivityAt: joinedAt };
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [{ type: "playerJoined", pin, player, players }],
      };
    },

    /**
     * A Player's client reconnects after a blip or a reload: re-attach the
     * existing Player (keyed by their localStorage playerId, not the socket id)
     * to their new socket, marking them connected again with score and rank
     * intact. Works in any phase — unlike playerJoin, which only admits new
     * Players in the Lobby. A gone Game or an unknown Player is rejected so the
     * client can fall back to a fresh join.
     * @param {GameStore} store
     * @param {{ pin: string, playerId: string }} cmd
     * @returns {CommandResult}
     */
    playerReconnect(store, { pin, playerId }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      const existing = game.players.find((p) => p.id === playerId);
      if (!existing) {
        return { ok: false, error: "We couldn't find your spot in this Game." };
      }
      const players = game.players.map((p) =>
        p.id === playerId ? { ...p, connected: true } : p,
      );
      const next = { ...game, players, lastActivityAt: now() };
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [
          {
            type: "playerReconnected",
            pin,
            player: players.find((p) => p.id === playerId),
            players,
          },
        ],
      };
    },

    /**
     * The Host's client reconnects and resumes control of the in-progress Game:
     * the host token (minted at createGame, kept in the Host's localStorage) must
     * match, so only the real Host resumes. Returns the live Game unchanged so
     * the adapter can re-attach the socket to the room and re-send the current
     * state. Touches activity so resuming keeps the Game off the idle GC.
     * @param {GameStore} store
     * @param {{ pin: string, hostToken: string }} cmd
     * @returns {CommandResult}
     */
    hostReconnect(store, { pin, hostToken }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      if (game.hostToken !== hostToken) {
        return { ok: false, error: "Only the Host can resume this Game." };
      }
      const next = { ...game, lastActivityAt: now() };
      return { ok: true, store: { ...store, [pin]: next }, game: next, events: [] };
    },

    /**
     * A Player's socket dropped: flag them disconnected without removing them,
     * so the Host sees them greyed out (PRD story 48) and their score/rank wait
     * for a reconnect. Deliberately does NOT touch lastActivityAt — a Game whose
     * participants have all dropped should age toward the idle GC, not be kept
     * alive by their leaving. A gone Game, an unknown Player, or one already
     * flagged is a silent no-op (no event) so the adapter needn't special-case
     * the reconnect/disconnect race.
     * @param {GameStore} store
     * @param {{ pin: string, playerId: string }} cmd
     * @returns {CommandResult}
     */
    markDisconnected(store, { pin, playerId }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      const existing = game.players.find((p) => p.id === playerId);
      if (!existing || !existing.connected) {
        return { ok: true, store, game, events: [] };
      }
      const players = game.players.map((p) =>
        p.id === playerId ? { ...p, connected: false } : p,
      );
      const next = { ...game, players };
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [
          {
            type: "playerDisconnected",
            pin,
            player: players.find((p) => p.id === playerId),
            players,
          },
        ],
      };
    },

    /**
     * The Host starts the Questions: no more joins, and the first Question opens
     * with its intro beat. `opensAt`/`closesAt` are absolute timestamps off the
     * injected clock, so the adapter schedules the countdown and the engine
     * scores taps against the same reference. The hostToken must match the one
     * from createGame, so only the Host can start.
     * @param {GameStore} store
     * @param {{ pin: string, hostToken: string, questions: EngineQuestion[], introMs?: number }} cmd
     * @returns {CommandResult}
     */
    startGame(store, { pin, hostToken, questions, introMs }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      if (game.status !== "lobby") {
        return { ok: false, error: "This Game has already started." };
      }
      if (game.hostToken !== hostToken) {
        return { ok: false, error: "Only the Host can start this Game." };
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        return { ok: false, error: "This Quiz has no Questions to play." };
      }

      const { next, event } = beginQuestion({ ...game, questions }, 0, introMs);
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [event],
      };
    },

    /**
     * A Player taps an Option. The Response locks instantly (first tap wins) and
     * is scored time-scaled: full points at `opensAt`, half at `closesAt`, zero
     * when wrong. A tap in the intro beat (before `opensAt`) counts as instant.
     * When every connected Player has answered, an `allAnswered` event tells the
     * adapter to start the 2s grace before closing.
     * @param {GameStore} store
     * @param {{ pin: string, playerId: string, optionId: string }} cmd
     * @returns {CommandResult}
     */
    submitResponse(store, { pin, playerId, optionId }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      if (game.status !== "question") {
        return { ok: false, error: "There's no open Question to answer." };
      }
      const question = game.questions[game.currentIndex];
      if (!game.players.some((p) => p.id === playerId)) {
        return { ok: false, error: "You're not in this Game." };
      }
      if (game.responses[playerId]) {
        return { ok: false, error: "You've already answered this Question." };
      }
      if (!question.options.some((o) => o.id === optionId)) {
        return { ok: false, error: "That's not an Option on this Question." };
      }

      const at = now();
      const limitMs = question.timeLimitSec * 1000;
      const timeUsed = clamp(at - game.opensAt, 0, limitMs);
      const correct = optionId === question.correctOptionId;
      const points = correct
        ? Math.round(question.points * (1 - timeUsed / limitMs / 2))
        : 0;

      /** @type {Response} */
      const response = { optionId, timeUsed, correct, points, at };
      const responses = { ...game.responses, [playerId]: response };
      const next = { ...game, responses, lastActivityAt: at };

      const answeredCount = Object.keys(responses).length;
      const connectedCount = game.players.filter((p) => p.connected).length;
      /** @type {GameEvent[]} */
      const events = [
        { type: "responseRecorded", pin, playerId, answeredCount, connectedCount },
      ];
      if (connectedCount > 0 && answeredCount >= connectedCount) {
        events.push({ type: "allAnswered", pin });
      }

      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events,
      };
    },

    /**
     * Close the live Question and reveal it: tally the Distribution across
     * Options, bank each Player's points into their running score, and report
     * per-Player results. Idempotent — a second close (both the timer and the
     * all-answered grace can fire) is a no-op so racing timers never crash.
     * @param {GameStore} store
     * @param {{ pin: string }} cmd
     * @returns {CommandResult}
     */
    closeQuestion(store, { pin }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      if (game.status !== "question") {
        // Already revealed (or never opened): nothing to do.
        return { ok: true, store, game, events: [] };
      }

      const index = game.currentIndex;
      const question = game.questions[index];

      const counts = question.options.map((o) => ({
        optionId: o.id,
        count: Object.values(game.responses).filter((r) => r.optionId === o.id).length,
      }));
      const answered = Object.keys(game.responses).length;
      /** @type {Distribution} */
      const distribution = { counts, noAnswer: game.players.length - answered };

      const players = game.players.map((p) => {
        const r = game.responses[p.id];
        return { ...p, score: p.score + (r ? r.points : 0) };
      });
      /** @type {QuestionResult[]} */
      const results = players.map((p) => {
        const r = game.responses[p.id];
        return {
          playerId: p.id,
          optionId: r ? r.optionId : null,
          correct: r ? r.correct : false,
          points: r ? r.points : 0,
          timeUsed: r ? r.timeUsed : null,
          totalScore: p.score,
        };
      });

      // Snapshot this Question into the Game's history now, while its Responses
      // are still in hand — opening the next Question clears them. The finished
      // Game is persisted from these (buildGameRecord); an abandoned one, which
      // never finishes, persists nothing (ADR-0002).
      /** @type {RoundRecord} */
      const round = {
        index,
        questionId: question.id,
        type: question.type,
        text: question.text,
        options: question.options.map((o) => ({ id: o.id, text: o.text })),
        correctOptionId: question.correctOptionId,
        points: question.points,
        timeLimitSec: question.timeLimitSec,
        distribution,
        responses: game.players.map((p) => {
          const r = game.responses[p.id];
          return {
            playerId: p.id,
            optionId: r ? r.optionId : null,
            timeUsed: r ? r.timeUsed : null,
            correct: r ? r.correct : false,
            points: r ? r.points : 0,
          };
        }),
      };

      const next = { ...game, status: "reveal", players, rounds: [...game.rounds, round], lastActivityAt: now() };
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [
          {
            type: "questionClosed",
            pin,
            index,
            correctOptionId: question.correctOptionId,
            distribution,
            results,
            players,
          },
        ],
      };
    },

    /**
     * The Host clicks "Next" to keep the Game moving. From a Reveal it shows the
     * interim Leaderboard; from that Leaderboard it opens the next Question. The
     * Host runs out of Questions here — the last Question's Leaderboard is
     * advanced no further and the Host calls `finish` for the Podium instead.
     * Only the Host (matching hostToken) can advance.
     * @param {GameStore} store
     * @param {{ pin: string, hostToken: string }} cmd
     * @returns {CommandResult}
     */
    advance(store, { pin, hostToken }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      if (game.hostToken !== hostToken) {
        return { ok: false, error: "Only the Host can advance this Game." };
      }

      if (game.status === "reveal") {
        const hasNext = game.currentIndex + 1 < game.questions.length;
        const next = { ...game, status: "leaderboard", lastActivityAt: now() };
        return {
          ok: true,
          store: { ...store, [pin]: next },
          game: next,
          events: [
            {
              type: "leaderboard",
              pin,
              index: game.currentIndex,
              standings: rankStandings(game.players),
              hasNext,
            },
          ],
        };
      }

      if (game.status === "leaderboard") {
        const nextIndex = game.currentIndex + 1;
        if (nextIndex >= game.questions.length) {
          return {
            ok: false,
            error: "That was the last Question — finish the Game to show the Podium.",
          };
        }
        const { next, event } = beginQuestion(game, nextIndex);
        return {
          ok: true,
          store: { ...store, [pin]: next },
          game: next,
          events: [event],
        };
      }

      return { ok: false, error: "There's nothing to advance to right now." };
    },

    /**
     * End the Game and show the final Podium: the full ranking (top-3 celebrated
     * on the Host screen, each Player's placement on their phone). Reachable from
     * a Reveal or its Leaderboard; idempotent once on the Podium so a double
     * click is harmless. The Podium stays in memory — persisting it as a Game
     * Record lands in #8. Only the Host (matching hostToken) can finish.
     * @param {GameStore} store
     * @param {{ pin: string, hostToken: string }} cmd
     * @returns {CommandResult}
     */
    finish(store, { pin, hostToken }) {
      const game = store[pin];
      if (!game) return { ok: false, error: "That Game is no longer active." };
      if (game.hostToken !== hostToken) {
        return { ok: false, error: "Only the Host can finish this Game." };
      }
      if (game.status === "podium") {
        // Already finished: a second finish (e.g. a double click) is a no-op.
        return { ok: true, store, game, events: [] };
      }
      if (game.status !== "reveal" && game.status !== "leaderboard") {
        return { ok: false, error: "The Game isn't ready to finish yet." };
      }

      const next = { ...game, status: "podium", lastActivityAt: now() };
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [{ type: "gameFinished", pin, standings: rankStandings(game.players) }],
      };
    },

    /**
     * Idle-timeout garbage collection (ADR-0002): evict every Game left idle
     * longer than `idleMs` — an abandoned Game whose Host and Players have all
     * drifted away — freeing its PIN for reuse. Runtime housekeeping rather than
     * a domain command, so it returns just the pruned store and the evicted PINs
     * (the adapter clears their timers). Returns the same store reference when
     * nothing is evicted, so the adapter can cheaply skip a no-op sweep.
     * @param {GameStore} store
     * @param {{ idleMs: number }} cmd
     * @returns {{ store: GameStore, evictedPins: string[] }}
     */
    gcIdleGames(store, { idleMs }) {
      const cutoff = now() - idleMs;
      const evictedPins = [];
      /** @type {GameStore} */
      const next = {};
      for (const [pin, game] of Object.entries(store)) {
        if (game.lastActivityAt <= cutoff) evictedPins.push(pin);
        else next[pin] = game;
      }
      return { store: evictedPins.length ? next : store, evictedPins };
    },
  };
}

module.exports = { createEngine, buildGameRecord, rankStandings, randomPin, DEFAULT_INTRO_MS, GRACE_MS, IDLE_GC_MS };
