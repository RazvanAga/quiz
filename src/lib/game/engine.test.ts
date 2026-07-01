import { beforeEach, describe, expect, it } from "vitest";
import {
  createEngine,
  type Engine,
  type EngineQuestion,
  type Game,
  type GameStore,
} from "./engine";

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
    const lobby = { status: "lobby" as const, players: [], createdAt: 0, questions: [], currentIndex: -1, opensAt: null, closesAt: null, responses: {} };
    const occupied: GameStore = {
      "1234": { pin: "1234", quizId: "a", hostToken: "ha", ...lobby },
      "5678": { pin: "5678", quizId: "b", hostToken: "hb", ...lobby },
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
      { id: "p1", name: "Ada", avatar: "fox", connected: true, joinedAt: 2000, score: 0 },
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

// A clock the test drives by hand, so scoring windows are exact rather than
// merely distinct. now() returns the current value; set()/advance() move it.
function manualClock(start = 0) {
  let t = start;
  const fn = () => t;
  fn.set = (v: number) => {
    t = v;
  };
  fn.advance = (d: number) => {
    t += d;
  };
  return fn;
}

// A single-choice Question: 20s limit, 1000 points, "a" correct.
const QUESTION: EngineQuestion = {
  id: "q1",
  type: "single",
  text: "2 + 2 = ?",
  imageUrl: null,
  options: [
    { id: "a", text: "4" },
    { id: "b", text: "5" },
    { id: "c", text: "6" },
    { id: "d", text: "7" },
  ],
  correctOptionId: "a",
  timeLimitSec: 20,
  points: 1000,
};

// Build a Game already started on QUESTION, with the given Players joined, its
// intro beat skipped (introMs 0 so opensAt === now at start) and the clock left
// at opensAt. Returns everything a play test needs.
function playingGame(names: string[]) {
  const clock = manualClock(0);
  const engine = createEngine({ now: clock, newPin: () => "0001" });
  let store: GameStore = {};

  const created = engine.createGame(store, { quizId: "q", hostToken: "host-1" });
  if (!created.ok) throw new Error("createGame failed");
  store = created.store;

  for (const name of names) {
    const joined = engine.playerJoin(store, {
      pin: "0001",
      playerId: name,
      name,
      avatar: "fox",
    });
    if (!joined.ok) throw new Error(`join ${name} failed`);
    store = joined.store;
  }

  const started = engine.startGame(store, {
    pin: "0001",
    hostToken: "host-1",
    questions: [QUESTION],
    introMs: 0,
  });
  if (!started.ok) throw new Error("startGame failed");
  store = started.store;

  return { engine, clock, store, started };
}

// A second single-choice Question so a full Game spans more than one: 10s limit,
// 500 points, "t" correct.
const QUESTION_2: EngineQuestion = {
  id: "q2",
  type: "single",
  text: "Capital of France?",
  imageUrl: null,
  options: [
    { id: "t", text: "Paris" },
    { id: "u", text: "Rome" },
    { id: "v", text: "Berlin" },
    { id: "w", text: "Madrid" },
  ],
  correctOptionId: "t",
  timeLimitSec: 10,
  points: 500,
};

// Build a Game started on the given Questions with the given Players joined,
// intro skipped (introMs 0) and the clock left at the first Question's opensAt.
function playingGameWith(questions: EngineQuestion[], names: string[]) {
  const clock = manualClock(0);
  const engine = createEngine({ now: clock, newPin: () => "0001" });
  let store: GameStore = {};

  const created = engine.createGame(store, { quizId: "q", hostToken: "host-1" });
  if (!created.ok) throw new Error("createGame failed");
  store = created.store;

  for (const name of names) {
    const joined = engine.playerJoin(store, { pin: "0001", playerId: name, name, avatar: "fox" });
    if (!joined.ok) throw new Error(`join ${name} failed`);
    store = joined.store;
  }

  const started = engine.startGame(store, {
    pin: "0001",
    hostToken: "host-1",
    questions,
    introMs: 0,
  });
  if (!started.ok) throw new Error("startGame failed");
  store = started.store;

  return { engine, clock, store };
}

describe("startGame", () => {
  it("opens the first Question with intro then answer windows and stops joins", () => {
    const { started } = playingGame(["Ada"]);
    expect(started.game.status).toBe("question");
    expect(started.game.currentIndex).toBe(0);
    // introMs 0 → Options tappable immediately; 20s limit → closes at 20000.
    expect(started.game.opensAt).toBe(0);
    expect(started.game.closesAt).toBe(20_000);

    const event = started.events[0];
    expect(event.type).toBe("questionStarted");
    if (event.type !== "questionStarted") return;
    expect(event.question.id).toBe("q1");
    expect(event.playerCount).toBe(1);
  });

  it("honours the intro beat when computing opensAt/closesAt", () => {
    const clock = manualClock(1000);
    const engine = createEngine({ now: clock, newPin: () => "0001" });
    const created = engine.createGame({}, { quizId: "q", hostToken: "h" });
    if (!created.ok) throw new Error("setup failed");
    const started = engine.startGame(created.store, {
      pin: "0001",
      hostToken: "h",
      questions: [QUESTION],
      introMs: 4000,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.game.opensAt).toBe(5000); // 1000 + 4000 intro
    expect(started.game.closesAt).toBe(25_000); // opensAt + 20s
  });

  it("rejects a start from anyone but the Host", () => {
    const clock = manualClock(0);
    const engine = createEngine({ now: clock, newPin: () => "0001" });
    const created = engine.createGame({}, { quizId: "q", hostToken: "host-1" });
    if (!created.ok) throw new Error("setup failed");
    const started = engine.startGame(created.store, {
      pin: "0001",
      hostToken: "someone-else",
      questions: [QUESTION],
    });
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.error).toMatch(/host/i);
  });

  it("rejects a Quiz with no Questions", () => {
    const clock = manualClock(0);
    const engine = createEngine({ now: clock, newPin: () => "0001" });
    const created = engine.createGame({}, { quizId: "q", hostToken: "h" });
    if (!created.ok) throw new Error("setup failed");
    const started = engine.startGame(created.store, {
      pin: "0001",
      hostToken: "h",
      questions: [],
    });
    expect(started.ok).toBe(false);
  });

  it("rejects a Player joining after Start (no late join)", () => {
    const { engine, store } = playingGame(["Ada"]);
    const late = engine.playerJoin(store, {
      pin: "0001",
      playerId: "late",
      name: "Zoe",
      avatar: "owl",
    });
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.error).toMatch(/already started/i);
  });
});

describe("submitResponse scoring", () => {
  it("scores a correct Response time-scaled: full at open, ~three-quarters, half at the buzzer", () => {
    const { engine, clock, store } = playingGame(["fast", "mid", "slow"]);
    let s = store;

    // fast answers the instant Options open → full points.
    clock.set(0);
    const r1 = engine.submitResponse(s, { pin: "0001", playerId: "fast", optionId: "a" });
    if (!r1.ok) throw new Error("r1");
    s = r1.store;

    // mid answers at the 10s mark of a 20s limit → 1 - 0.25 = 0.75.
    clock.set(10_000);
    const r2 = engine.submitResponse(s, { pin: "0001", playerId: "mid", optionId: "a" });
    if (!r2.ok) throw new Error("r2");
    s = r2.store;

    // slow answers right at the buzzer → half points.
    clock.set(20_000);
    const r3 = engine.submitResponse(s, { pin: "0001", playerId: "slow", optionId: "a" });
    if (!r3.ok) throw new Error("r3");
    s = r3.store;

    expect(s["0001"].responses.fast.points).toBe(1000);
    expect(s["0001"].responses.mid.points).toBe(750);
    expect(s["0001"].responses.slow.points).toBe(500);
  });

  it("scores a wrong Response zero", () => {
    const { engine, clock, store } = playingGame(["Ada"]);
    clock.set(0);
    const r = engine.submitResponse(store, { pin: "0001", playerId: "Ada", optionId: "b" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.responses.Ada.correct).toBe(false);
    expect(r.game.responses.Ada.points).toBe(0);
  });

  it("locks the first Response and rejects a second tap", () => {
    const { engine, store } = playingGame(["Ada"]);
    const first = engine.submitResponse(store, { pin: "0001", playerId: "Ada", optionId: "a" });
    if (!first.ok) throw new Error("first");
    const second = engine.submitResponse(first.store, {
      pin: "0001",
      playerId: "Ada",
      optionId: "b",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatch(/already answered/i);
  });

  it("emits allAnswered only once every connected Player has answered", () => {
    const { engine, store } = playingGame(["Ada", "Bo"]);
    const first = engine.submitResponse(store, { pin: "0001", playerId: "Ada", optionId: "a" });
    if (!first.ok) throw new Error("first");
    expect(first.events.some((e) => e.type === "allAnswered")).toBe(false);

    const second = engine.submitResponse(first.store, {
      pin: "0001",
      playerId: "Bo",
      optionId: "b",
    });
    if (!second.ok) throw new Error("second");
    expect(second.events.some((e) => e.type === "allAnswered")).toBe(true);
  });
});

describe("closeQuestion", () => {
  it("close-on-timeout reveals the answer, banks scores, and tallies the Distribution", () => {
    const { engine, clock, store } = playingGame(["fast", "wrong", "silent"]);
    let s = store;
    clock.set(0);
    s = (engine.submitResponse(s, { pin: "0001", playerId: "fast", optionId: "a" }) as any).store;
    s = (engine.submitResponse(s, { pin: "0001", playerId: "wrong", optionId: "b" }) as any).store;
    // "silent" never answers; the Question closes on timeout.
    clock.set(20_000);

    const closed = engine.closeQuestion(s, { pin: "0001" });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.game.status).toBe("reveal");

    const event = closed.events[0];
    expect(event.type).toBe("questionClosed");
    if (event.type !== "questionClosed") return;
    expect(event.correctOptionId).toBe("a");
    // Distribution: one for "a", one for "b", none elsewhere; one unanswered.
    expect(event.distribution.counts).toEqual([
      { optionId: "a", count: 1 },
      { optionId: "b", count: 1 },
      { optionId: "c", count: 0 },
      { optionId: "d", count: 0 },
    ]);
    expect(event.distribution.noAnswer).toBe(1);

    // Only the correct Player banked points; the silent Player earns zero.
    const byId = Object.fromEntries(closed.game.players.map((p) => [p.id, p.score]));
    expect(byId.fast).toBe(1000);
    expect(byId.wrong).toBe(0);
    expect(byId.silent).toBe(0);
  });

  it("is idempotent so racing timers (timeout vs all-answered grace) can't double-close", () => {
    const { engine, store } = playingGame(["Ada"]);
    const first = engine.closeQuestion(store, { pin: "0001" });
    if (!first.ok) throw new Error("first");
    const second = engine.closeQuestion(first.store, { pin: "0001" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.events).toEqual([]);
  });
});

describe("advance and finish", () => {
  // Drive one Question to its Reveal: answer (optionally), jump to the buzzer,
  // and close. Returns the post-Reveal store.
  function revealFirstQuestion(
    engine: Engine,
    clock: ReturnType<typeof manualClock>,
    store: GameStore,
    answers: Record<string, string>,
    limitSec: number,
  ): GameStore {
    let s = store;
    clock.set(0);
    for (const [playerId, optionId] of Object.entries(answers)) {
      const r = engine.submitResponse(s, { pin: "0001", playerId, optionId });
      if (!r.ok) throw new Error(`submit ${playerId} failed`);
      s = r.store;
    }
    clock.set(limitSec * 1000);
    const closed = engine.closeQuestion(s, { pin: "0001" });
    if (!closed.ok) throw new Error("close failed");
    return closed.store;
  }

  it("advances Reveal → interim Leaderboard ranked by score", () => {
    const { engine, clock, store } = playingGameWith([QUESTION, QUESTION_2], ["Ada", "Bo"]);
    // Ada is right (full points), Bo is wrong (zero).
    let s = revealFirstQuestion(engine, clock, store, { Ada: "a", Bo: "b" }, 20);

    const adv = engine.advance(s, { pin: "0001", hostToken: "host-1" });
    expect(adv.ok).toBe(true);
    if (!adv.ok) return;
    expect(adv.game.status).toBe("leaderboard");

    const event = adv.events[0];
    expect(event.type).toBe("leaderboard");
    if (event.type !== "leaderboard") return;
    expect(event.index).toBe(0);
    expect(event.hasNext).toBe(true); // a second Question remains
    expect(event.standings).toEqual([
      { playerId: "Ada", name: "Ada", avatar: "fox", score: 1000, rank: 1 },
      { playerId: "Bo", name: "Bo", avatar: "fox", score: 0, rank: 2 },
    ]);
  });

  it("advances the Leaderboard into the next Question", () => {
    const { engine, clock, store } = playingGameWith([QUESTION, QUESTION_2], ["Ada"]);
    const s = revealFirstQuestion(engine, clock, store, { Ada: "a" }, 20);
    const toBoard = engine.advance(s, { pin: "0001", hostToken: "host-1" });
    if (!toBoard.ok) throw new Error("to leaderboard failed");

    const toNext = engine.advance(toBoard.store, { pin: "0001", hostToken: "host-1" });
    expect(toNext.ok).toBe(true);
    if (!toNext.ok) return;
    expect(toNext.game.status).toBe("question");
    expect(toNext.game.currentIndex).toBe(1);
    // Responses reset for the fresh Question; banked score carries over.
    expect(toNext.game.responses).toEqual({});
    expect(toNext.game.players[0].score).toBe(1000);

    const event = toNext.events[0];
    expect(event.type).toBe("questionStarted");
    if (event.type !== "questionStarted") return;
    expect(event.question.id).toBe("q2");
  });

  it("won't advance past the last Question's Leaderboard", () => {
    const { engine, clock, store } = playingGameWith([QUESTION], ["Ada"]);
    const s = revealFirstQuestion(engine, clock, store, { Ada: "a" }, 20);
    const toBoard = engine.advance(s, { pin: "0001", hostToken: "host-1" });
    if (!toBoard.ok) throw new Error("to leaderboard failed");
    // hasNext is false on the only Question's Leaderboard.
    const board = toBoard.events[0];
    expect(board.type === "leaderboard" && board.hasNext).toBe(false);

    const past = engine.advance(toBoard.store, { pin: "0001", hostToken: "host-1" });
    expect(past.ok).toBe(false);
    if (past.ok) return;
    expect(past.error).toMatch(/finish/i);
  });

  it("rejects advance and finish from anyone but the Host", () => {
    const { engine, clock, store } = playingGameWith([QUESTION], ["Ada"]);
    const s = revealFirstQuestion(engine, clock, store, { Ada: "a" }, 20);
    const adv = engine.advance(s, { pin: "0001", hostToken: "nope" });
    expect(adv.ok).toBe(false);
    const fin = engine.finish(s, { pin: "0001", hostToken: "nope" });
    expect(fin.ok).toBe(false);
    if (fin.ok) return;
    expect(fin.error).toMatch(/host/i);
  });

  it("finishes to a Podium with the full ranking", () => {
    const { engine, clock, store } = playingGameWith([QUESTION], ["Ada", "Bo"]);
    const s = revealFirstQuestion(engine, clock, store, { Ada: "a", Bo: "b" }, 20);
    const toBoard = engine.advance(s, { pin: "0001", hostToken: "host-1" });
    if (!toBoard.ok) throw new Error("to leaderboard failed");

    const fin = engine.finish(toBoard.store, { pin: "0001", hostToken: "host-1" });
    expect(fin.ok).toBe(true);
    if (!fin.ok) return;
    expect(fin.game.status).toBe("podium");

    const event = fin.events[0];
    expect(event.type).toBe("gameFinished");
    if (event.type !== "gameFinished") return;
    expect(event.standings).toEqual([
      { playerId: "Ada", name: "Ada", avatar: "fox", score: 1000, rank: 1 },
      { playerId: "Bo", name: "Bo", avatar: "fox", score: 0, rank: 2 },
    ]);
  });

  it("is idempotent once on the Podium so a double finish is harmless", () => {
    const { engine, clock, store } = playingGameWith([QUESTION], ["Ada"]);
    const s = revealFirstQuestion(engine, clock, store, { Ada: "a" }, 20);
    const first = engine.finish(s, { pin: "0001", hostToken: "host-1" });
    if (!first.ok) throw new Error("first finish failed");
    expect(first.game.status).toBe("podium");
    const second = engine.finish(first.store, { pin: "0001", hostToken: "host-1" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.events).toEqual([]);
  });

  it("gives tied Players the same rank (standard competition ranking)", () => {
    const { engine, clock, store } = playingGameWith([QUESTION], ["Ada", "Bo", "Cy"]);
    // Ada and Bo both answer correctly at the open (full points); Cy is wrong.
    const s = revealFirstQuestion(engine, clock, store, { Ada: "a", Bo: "a", Cy: "b" }, 20);
    const fin = engine.finish(s, { pin: "0001", hostToken: "host-1" });
    if (!fin.ok) throw new Error("finish failed");
    const event = fin.events[0];
    if (event.type !== "gameFinished") throw new Error("expected gameFinished");
    // Ada and Bo share rank 1; Cy is rank 3 (rank 2 is skipped).
    expect(event.standings.map((s2) => [s2.playerId, s2.rank])).toEqual([
      ["Ada", 1],
      ["Bo", 1],
      ["Cy", 3],
    ]);
  });

  it("plays a full Game: lobby → two Questions → Podium, banking scores", () => {
    const { engine, clock, store } = playingGameWith([QUESTION, QUESTION_2], ["Ada", "Bo"]);

    // Q1 (1000 pts): Ada right at open (1000), Bo wrong (0).
    let s = revealFirstQuestion(engine, clock, store, { Ada: "a", Bo: "b" }, 20);
    expect(s["0001"].status).toBe("reveal");
    s = (engine.advance(s, { pin: "0001", hostToken: "host-1" }) as { store: GameStore }).store;
    expect(s["0001"].status).toBe("leaderboard");
    const toQ2 = engine.advance(s, { pin: "0001", hostToken: "host-1" });
    if (!toQ2.ok) throw new Error("advance to Q2 failed");
    s = toQ2.store;
    expect(s["0001"].status).toBe("question");
    expect(s["0001"].currentIndex).toBe(1);

    // Q2 (500 pts, 10s): both right at open → +500 each.
    clock.set(0);
    s = (engine.submitResponse(s, { pin: "0001", playerId: "Ada", optionId: "t" }) as { store: GameStore }).store;
    s = (engine.submitResponse(s, { pin: "0001", playerId: "Bo", optionId: "t" }) as { store: GameStore }).store;
    clock.set(10_000);
    s = (engine.closeQuestion(s, { pin: "0001" }) as { store: GameStore }).store;
    s = (engine.advance(s, { pin: "0001", hostToken: "host-1" }) as { store: GameStore }).store;

    const fin = engine.finish(s, { pin: "0001", hostToken: "host-1" });
    if (!fin.ok) throw new Error("finish failed");
    expect(fin.game.status).toBe("podium");
    const event = fin.events[0];
    if (event.type !== "gameFinished") throw new Error("expected gameFinished");
    // Ada 1000 + 500 = 1500 (rank 1); Bo 0 + 500 = 500 (rank 2).
    expect(event.standings).toEqual([
      { playerId: "Ada", name: "Ada", avatar: "fox", score: 1500, rank: 1 },
      { playerId: "Bo", name: "Bo", avatar: "fox", score: 500, rank: 2 },
    ]);
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
