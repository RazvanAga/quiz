import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioClient, type Socket } from "socket.io-client";
import { attachGameSockets } from "./socket-adapter";

// Seam 3: Socket.IO smoke test. A real socket.io-client drives one happy-path
// Game against a real io Server with the adapter attached, catching the wiring
// and serialization mistakes the pure-engine tests (Seam 1) can't see — the
// answer stripped before it reaches a Player, event shapes on the wire, private
// vs room-wide emits. Kept to a single end-to-end flow to stay fast and stable;
// the one unavoidable wall-clock beat is the real 2s all-answered grace timer
// before the Reveal.

// Resolve with the first payload the socket receives for `event`.
function once<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Emit `event` and resolve with the server's ack payload.
function emitAck<T = any>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

// Connect a fresh client to the running server and wait until it's connected.
function connect(port: number): Promise<Socket> {
  const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
  return new Promise((resolve) => socket.on("connect", () => resolve(socket)));
}

// One single-choice Question with a known correct Option, carrying the correct
// answer (as the Host would send it) so we can assert it's stripped for Players.
const QUESTION = {
  id: "q1",
  type: "single",
  text: "What is 2 + 2?",
  imageUrl: null,
  options: [
    { id: "a", text: "3" },
    { id: "b", text: "4" },
    { id: "c", text: "5" },
  ],
  correctOptionId: "b",
  timeLimitSec: 20,
  points: 1000,
};

describe("Socket.IO adapter — happy-path Game", () => {
  let httpServer: HttpServer;
  let io: Server;
  let adapter: { close: () => void };
  let port: number;
  let host: Socket;
  let player: Socket;
  // Records the adapter persists on finish, so we can assert the Game landed.
  let savedRecords: any[];

  beforeEach(async () => {
    savedRecords = [];
    httpServer = createServer();
    io = new Server(httpServer);
    adapter = attachGameSockets(io, {
      gameRecords: { saveGameRecord: (record: unknown) => savedRecords.push(record) },
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
    host = await connect(port);
    player = await connect(port);
  });

  afterEach(async () => {
    host.disconnect();
    player.disconnect();
    adapter.close();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("runs create → join → start → answer → reveal → finish over the wire", async () => {
    const hostToken = "host-secret";

    // Host creates a Game and gets a PIN back.
    const created = await emitAck<{ ok: boolean; pin: string }>(host, "host:createGame", {
      quizId: "quiz-1",
      hostToken,
    });
    expect(created.ok).toBe(true);
    expect(created.pin).toMatch(/^\d{4}$/);
    const pin = created.pin;

    // Player joins the Lobby; the Host screen sees the roster update live.
    const lobbyUpdate = once<{ players: any[] }>(host, "lobby:update");
    const joined = await emitAck<{ ok: boolean; you: any; players: any[] }>(player, "player:join", {
      pin,
      playerId: "p1",
      name: "Ada",
      avatar: "🦊",
    });
    expect(joined.ok).toBe(true);
    expect(joined.you).toMatchObject({ id: "p1", name: "Ada", avatar: "🦊", score: 0 });
    expect((await lobbyUpdate).players.map((p) => p.name)).toEqual(["Ada"]);

    // Host starts the Game. Listeners go on before the emit — the adapter
    // broadcasts question:begin synchronously with the ack.
    const beginToPlayer = once<any>(player, "question:begin");
    const beginToHost = once<any>(host, "question:begin");
    const startAck = await emitAck<{ ok: boolean }>(host, "host:startGame", {
      pin,
      hostToken,
      questions: [QUESTION],
    });
    expect(startAck.ok).toBe(true);

    const begin = await beginToPlayer;
    await beginToHost;
    expect(begin.index).toBe(0);
    expect(begin.total).toBe(1);
    // The Question serializes correctly — and the correct answer is stripped
    // before it reaches a Player's phone.
    expect(begin.question).toEqual({
      id: "q1",
      type: "single",
      text: "What is 2 + 2?",
      imageUrl: null,
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "4" },
        { id: "c", text: "5" },
      ],
      timeLimitSec: 20,
      points: 1000,
    });
    expect(begin.question).not.toHaveProperty("correctOptionId");

    // Player taps the correct Option. With everyone answered, the room-wide
    // Reveal and the Player's private result follow after the grace timer.
    const revealToPlayer = once<any>(player, "question:reveal");
    const youResult = once<any>(player, "you:result");
    const submit = await emitAck<{ ok: boolean; locked: boolean }>(player, "player:submitResponse", {
      pin,
      playerId: "p1",
      optionId: "b",
    });
    expect(submit).toEqual({ ok: true, locked: true });

    const reveal = await revealToPlayer;
    expect(reveal.index).toBe(0);
    expect(reveal.correctOptionId).toBe("b");
    expect(reveal.distribution).toEqual({
      counts: [
        { optionId: "a", count: 0 },
        { optionId: "b", count: 1 },
        { optionId: "c", count: 0 },
      ],
      noAnswer: 0,
    });

    // The Reveal is the only time a Player learns their own outcome, privately.
    const you = await youResult;
    expect(you.correct).toBe(true);
    expect(you.pointsGained).toBeGreaterThan(0);
    expect(you.totalScore).toBe(you.pointsGained);

    // Host advances to the interim Leaderboard — the only Question, so no next.
    const leaderboard = once<any>(player, "game:leaderboard");
    await emitAck(host, "host:advance", { pin, hostToken });
    const lb = await leaderboard;
    expect(lb.hasNext).toBe(false);
    expect(lb.standings).toHaveLength(1);
    expect(lb.standings[0]).toMatchObject({ playerId: "p1", name: "Ada", rank: 1 });

    // Host finishes: the Podium reaches the room and the Game Record is persisted.
    const podium = once<any>(player, "game:podium");
    await emitAck(host, "host:finish", { pin, hostToken });
    const pod = await podium;
    expect(pod.standings[0]).toMatchObject({ playerId: "p1", name: "Ada", rank: 1 });
    expect(pod.standings[0].score).toBeGreaterThan(0);

    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0]).toMatchObject({ pin, quizId: "quiz-1", playerCount: 1 });
    expect(savedRecords[0].rounds).toHaveLength(1);
  }, 15_000);
});
