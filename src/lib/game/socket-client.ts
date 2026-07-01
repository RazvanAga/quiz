"use client";

import { io, type Socket } from "socket.io-client";

// One shared Socket.IO connection per browser tab to the same-origin custom
// server (ADR-0001). Lazily created so it only opens when a live screen (Player
// join, Host Lobby) actually needs it.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) socket = io({ autoConnect: true });
  return socket;
}

// The Player shape as it travels to the browser (a subset of the engine's
// Player). Defined here so client components don't import the JS engine module.
export interface LobbyPlayer {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  joinedAt: number;
}

// A Question as it reaches a phone during play — the authored shape minus the
// correct Option, which only travels at the Reveal. Shared by the Host screen
// and Player phones.
export interface PlayQuestion {
  id: string;
  type: "single" | "truefalse";
  text: string;
  imageUrl: string | null;
  options: { id: string; text: string }[];
  timeLimitSec: number;
  points: number;
}

// Payload of `question:begin`: the Question plus its intro/answer windows in ms
// (relative to receipt, so each screen runs its own countdown) and the Player
// count answering.
export interface QuestionBegin {
  index: number;
  question: PlayQuestion;
  introMs: number;
  answerMs: number;
  total: number;
}

// The per-Question Distribution of Responses across Options (docs/CONTEXT.md).
export interface Distribution {
  counts: { optionId: string; count: number }[];
  noAnswer: number;
}

// Payload of `question:reveal`: the correct Option and the Distribution, shown
// on the Host screen and used by Players to see whether they were right.
export interface QuestionReveal {
  index: number;
  correctOptionId: string;
  distribution: Distribution;
}

// Payload of `you:result`: a single Player's own outcome for the closed Question.
export interface YouResult {
  correct: boolean;
  pointsGained: number;
  totalScore: number;
}

// One ranked row of an interim Leaderboard or the final Podium (docs/CONTEXT.md).
// Ranks share on ties (standard competition ranking), highest score first.
export interface Standing {
  playerId: string;
  name: string;
  avatar: string;
  score: number;
  rank: number;
}

// Payload of `game:leaderboard`: the interim standings after a Reveal, plus
// whether another Question follows (so the Host shows "Next" vs "Final results").
export interface LeaderboardUpdate {
  index: number;
  standings: Standing[];
  hasNext: boolean;
}

// Payload of `game:podium`: the final ranking shown when the Game finishes.
export interface Podium {
  standings: Standing[];
}

// A stable per-browser Player identity (PRD "Identity & reconnection"): a UUID
// kept in localStorage, so a reconnecting client re-attaches to the same Player
// rather than the socket id. Reconnection itself lands in #9.
export function getPlayerId(): string {
  const KEY = "quiz:playerId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
