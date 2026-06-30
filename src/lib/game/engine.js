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
 */

/**
 * The Game lifecycle (PRD state machine). #5 implements only the lobby; the
 * remaining phases (question_intro, question_open, ...) land in #6+.
 * @typedef {"lobby"} GameStatus
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
 */

/**
 * The set of active Games, keyed by Game PIN. The Socket.IO adapter holds one
 * of these and threads it through engine calls (the engine never mutates it).
 * @typedef {Object.<string, Game>} GameStore
 */

/**
 * An event the adapter should emit over Socket.IO in response to a command.
 * @typedef {{ type: "gameCreated", pin: string }
 *   | { type: "playerJoined", pin: string, player: Player, players: Player[] }} GameEvent
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
 */

/** Generate a random 4-digit Game PIN, e.g. "0042". */
function randomPin() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

const TOTAL_PINS = 10000;

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

  return {
    /**
     * Start a new Game from a Quiz: mint a unique PIN and open its Lobby.
     * @param {GameStore} store
     * @param {{ quizId: string, hostToken: string }} cmd
     * @returns {CommandResult}
     */
    createGame(store, { quizId, hostToken }) {
      const pin = allocatePin(store);
      /** @type {Game} */
      const game = {
        pin,
        quizId,
        hostToken,
        status: "lobby",
        players: [],
        createdAt: now(),
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
        const next = { ...game, players };
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

      /** @type {Player} */
      const player = {
        id: playerId,
        name: trimmedName,
        avatar,
        connected: true,
        joinedAt: now(),
      };
      const players = [...game.players, player];
      const next = { ...game, players };
      return {
        ok: true,
        store: { ...store, [pin]: next },
        game: next,
        events: [{ type: "playerJoined", pin, player, players }],
      };
    },
  };
}

module.exports = { createEngine, randomPin };
