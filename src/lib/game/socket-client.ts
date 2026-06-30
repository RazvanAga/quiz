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
