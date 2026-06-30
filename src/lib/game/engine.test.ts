import { beforeEach, describe, expect, it } from "vitest";
import { createEngine, type Engine, type Game, type GameStore } from "./engine";

// Seam 1: the pure, transport-free Game engine. Commands in -> next state +
// events out, with an injected now() clock (and an injectable PIN generator so
// collision-retry is deterministic to test). No sockets, no real timers.

// A clock that advances by 1000ms each read, so joinedAt/createdAt are distinct
// and assertable.
function steppingClock(start = 1_000): () => number {
  let t = start;
  return () => (t += 1000) - 1000;
}

// A PIN generator that hands out the given PINs in order, then throws if asked
// for more than were scripted (so a test that loops forever fails loudly).
function scriptedPins(...pins: string[]): () => string {
  let i = 0;
  return () => {
    if (i >= pins.length) throw new Error("ran out of scripted PINs");
    return pins[i++];
  };
}

describe("createGame", () => {
  it("creates a Game in the lobby with a 4-digit PIN and no Players", () => {
    const engine = createEngine({ now: steppingClock(5000), newPin: scriptedPins("0042") });
    const store: GameStore = {};

    const result = engine.createGame(store, { quizId: "quiz-1", hostToken: "host-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.pin).toBe("0042");
    expect(result.game.quizId).toBe("quiz-1");
    expect(result.game.hostToken).toBe("host-1");
    expect(result.game.status).toBe("lobby");
    expect(result.game.players).toEqual([]);
    expect(result.game.createdAt).toBe(5000);
    // Stored under its PIN, and a gameCreated event is emitted.
    expect(result.store["0042"]).toBe(result.game);
    expect(result.events).toEqual([{ type: "gameCreated", pin: "0042" }]);
  });

  it("does not mutate the input store", () => {
    const engine = createEngine({ newPin: scriptedPins("1111") });
    const store: GameStore = {};
    engine.createGame(store, { quizId: "q", hostToken: "h" });
    expect(store).toEqual({});
  });

  it("retries PIN generation until it finds one free of active Games", () => {
    // Two Games already hold 1234 and 5678; the generator offers both before a
    // free one, so the new Game must land on 9999.
    const engine = createEngine({ newPin: scriptedPins("1234", "5678", "9999") });
    const occupied: GameStore = {
      "1234": { pin: "1234", quizId: "a", hostToken: "ha", status: "lobby", players: [], createdAt: 0 },
      "5678": { pin: "5678", quizId: "b", hostToken: "hb", status: "lobby", players: [], createdAt: 0 },
    };

    const result = engine.createGame(occupied, { quizId: "c", hostToken: "hc" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.pin).toBe("9999");
    // The occupied Games are still present alongside the new one.
    expect(Object.keys(result.store).sort()).toEqual(["1234", "5678", "9999"]);
  });
});

describe("playerJoin", () => {
  let engine: Engine;
  let store: GameStore;
  let game: Game;

  beforeEach(() => {
    engine = createEngine({ now: steppingClock(1000), newPin: scriptedPins("4242") });
    const created = engine.createGame({}, { quizId: "q", hostToken: "h" });
    if (!created.ok) throw new Error("setup failed");
    store = created.store;
    game = created.game;
  });

  it("adds a Player to the Lobby and emits the new roster", () => {
    const result = engine.playerJoin(store, {
      pin: game.pin,
      playerId: "p1",
      name: "Ada",
      avatar: "fox",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // createGame consumed the first tick (createdAt 1000), so this join sees 2000.
    expect(result.game.players).toEqual([
      { id: "p1", name: "Ada", avatar: "fox", connected: true, joinedAt: 2000 },
    ]);
    const joined = result.events[0];
    expect(joined.type).toBe("playerJoined");
    if (joined.type !== "playerJoined") return;
    expect(joined.pin).toBe("4242");
    expect(joined.player.name).toBe("Ada");
    // The event carries the full roster so the Host Lobby can re-render.
    expect(joined.players).toHaveLength(1);
  });

  it("trims the display name", () => {
    const result = engine.playerJoin(store, {
      pin: game.pin,
      playerId: "p1",
      name: "  Ada  ",
      avatar: "fox",
    });
    expect(result.ok && result.game.players[0].name).toBe("Ada");
  });

  it("rejects a duplicate name (case-insensitive) with a clear message", () => {
    const first = engine.playerJoin(store, { pin: game.pin, playerId: "p1", name: "Ada", avatar: "fox" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = engine.playerJoin(first.store, {
      pin: game.pin,
      playerId: "p2",
      name: "ADA",
      avatar: "owl",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatch(/taken/i);
  });

  it("rejects a wrong/expired PIN with a clear message", () => {
    const result = engine.playerJoin(store, {
      pin: "0000",
      playerId: "p1",
      name: "Ada",
      avatar: "fox",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/pin/i);
  });

  it("rejects an empty display name and a missing Avatar", () => {
    const noName = engine.playerJoin(store, { pin: game.pin, playerId: "p1", name: "   ", avatar: "fox" });
    expect(noName.ok).toBe(false);

    const noAvatar = engine.playerJoin(store, { pin: game.pin, playerId: "p1", name: "Ada", avatar: "" });
    expect(noAvatar.ok).toBe(false);
  });

  it("treats a re-join with the same playerId as idempotent (no duplicate)", () => {
    const first = engine.playerJoin(store, { pin: game.pin, playerId: "p1", name: "Ada", avatar: "fox" });
    if (!first.ok) throw new Error("first join failed");

    const again = engine.playerJoin(first.store, { pin: game.pin, playerId: "p1", name: "Ada", avatar: "fox" });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.game.players).toHaveLength(1);
  });

  it("does not mutate the input store", () => {
    engine.playerJoin(store, { pin: game.pin, playerId: "p1", name: "Ada", avatar: "fox" });
    expect(store[game.pin].players).toEqual([]);
  });
});

describe("concurrent Games", () => {
  it("keeps Games independent and allows the same name in different Games", () => {
    const engine = createEngine({ newPin: scriptedPins("1111", "2222") });
    let store: GameStore = {};
    const a = engine.createGame(store, { quizId: "q", hostToken: "ha" });
    store = a.ok ? a.store : store;
    const b = engine.createGame(store, { quizId: "q", hostToken: "hb" });
    store = b.ok ? b.store : store;

    const ja = engine.playerJoin(store, { pin: "1111", playerId: "p1", name: "Ada", avatar: "fox" });
    store = ja.ok ? ja.store : store;
    const jb = engine.playerJoin(store, { pin: "2222", playerId: "p2", name: "Ada", avatar: "owl" });

    expect(ja.ok && jb.ok).toBe(true);
    expect(store["1111"].players).toHaveLength(1);
    if (jb.ok) expect(jb.game.players).toHaveLength(1);
  });
});
