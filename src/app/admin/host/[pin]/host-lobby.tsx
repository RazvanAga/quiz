"use client";

import { useEffect, useState } from "react";
import { avatarGlyph } from "@/lib/game/avatars";
import { getSocket, type LobbyPlayer } from "@/lib/game/socket-client";

// The Host's shared screen during the Lobby (PRD stories 18, 20): the Game PIN
// shown large for Players to join by, and Players popping in live (name +
// Avatar) as they do. Starting the Questions is the Host's call in #6.
export function HostLobby({ pin }: { pin: string }) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [status, setStatus] = useState<"attaching" | "live" | "gone">("attaching");

  useEffect(() => {
    const socket = getSocket();

    function attach() {
      socket.emit(
        "host:attach",
        { pin },
        (res: { ok: true; players: LobbyPlayer[] } | { ok: false; error: string }) => {
          if (!res.ok) {
            setStatus("gone");
            return;
          }
          setPlayers(res.players);
          setStatus("live");
        },
      );
    }

    function onLobbyUpdate({ players }: { players: LobbyPlayer[] }) {
      setPlayers(players);
    }

    attach();
    // Re-attach if the socket reconnects (the room membership is per-connection).
    socket.on("connect", attach);
    socket.on("lobby:update", onLobbyUpdate);
    return () => {
      socket.off("connect", attach);
      socket.off("lobby:update", onLobbyUpdate);
    };
  }, [pin]);

  if (status === "gone") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-2xl font-semibold text-slate-200">That Game is no longer active.</p>
        <a href="/admin" className="text-indigo-400 hover:text-indigo-300">
          ← Back to the Quiz library
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900/60 py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Join at this screen&apos;s address with PIN
        </p>
        <p className="font-mono text-7xl font-black tracking-[0.2em] text-emerald-400 sm:text-8xl">
          {pin}
        </p>
      </div>

      <div className="mt-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Lobby</h1>
        <p className="text-slate-400">
          {players.length} {players.length === 1 ? "Player" : "Players"} in
        </p>
      </div>

      {players.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center text-slate-500">
          Waiting for Players to join…
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {players.map((p) => (
            <li
              key={p.id}
              className={`flex flex-col items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-5 ${
                p.connected ? "" : "opacity-50"
              }`}
            >
              <span className="text-5xl" aria-hidden>
                {avatarGlyph(p.avatar)}
              </span>
              <span className="max-w-full truncate text-center font-semibold text-slate-100">
                {p.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
