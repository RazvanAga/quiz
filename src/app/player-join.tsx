"use client";

import { useEffect, useState } from "react";
import { AVATARS, avatarGlyph } from "@/lib/game/avatars";
import { getSocket, getPlayerId, type LobbyPlayer } from "@/lib/game/socket-client";

// The Player site (PRD stories 22-28): set a display name, pick a preset Avatar,
// enter a Game PIN, and wait in the Lobby. A wrong/expired PIN or a name already
// taken comes back as a clear message. No late joins (enforced from #6); #5 is
// Lobby-only.
export function PlayerJoin() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0].id);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "joining" | "lobby">("form");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);

  useEffect(() => {
    if (phase !== "lobby") return;
    const socket = getSocket();
    function onLobbyUpdate({ players }: { players: LobbyPlayer[] }) {
      setPlayers(players);
    }
    socket.on("lobby:update", onLobbyUpdate);
    return () => {
      socket.off("lobby:update", onLobbyUpdate);
    };
  }, [phase]);

  function join(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a display name to join.");
    if (!/^\d{4}$/.test(pin)) return setError("Enter the 4-digit Game PIN.");

    setError(null);
    setPhase("joining");
    getSocket().emit(
      "player:join",
      { pin, playerId: getPlayerId(), name: trimmed, avatar },
      (res: { ok: true; players: LobbyPlayer[] } | { ok: false; error: string }) => {
        if (!res.ok) {
          setError(res.error);
          setPhase("form");
          return;
        }
        setPlayers(res.players);
        setPhase("lobby");
      },
    );
  }

  if (phase === "lobby") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <span className="text-7xl" aria-hidden>
          {avatarGlyph(avatar)}
        </span>
        <div>
          <h1 className="text-3xl font-black">You&apos;re in, {name.trim()}!</h1>
          <p className="mt-2 text-slate-400">Hang tight — the Host will start the Game soon.</p>
        </div>
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {players.length} {players.length === 1 ? "Player" : "Players"} in the Lobby
          </p>
          <ul className="flex flex-wrap justify-center gap-3">
            {players.map((p) => (
              <li key={p.id} className="flex flex-col items-center gap-1">
                <span className="text-3xl" aria-hidden>
                  {avatarGlyph(p.avatar)}
                </span>
                <span className="max-w-20 truncate text-xs text-slate-300">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight">Join the Quiz</h1>
        <p className="mt-2 text-slate-400">Pick a name and an Avatar, then enter the PIN.</p>
      </header>

      <form onSubmit={join} className="space-y-6">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-300">
            Display name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            required
            placeholder="e.g. Ada"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-300">Avatar</legend>
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAvatar(a.id)}
                aria-label={a.label}
                aria-pressed={avatar === a.id}
                className={`flex aspect-square items-center justify-center rounded-xl border text-2xl transition ${
                  avatar === a.id
                    ? "border-indigo-500 bg-indigo-500/20"
                    : "border-slate-800 bg-slate-900 hover:border-slate-600"
                }`}
              >
                <span aria-hidden>{a.glyph}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="pin" className="mb-2 block text-sm font-semibold text-slate-300">
            Game PIN
          </label>
          <input
            id="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="\d{4}"
            placeholder="0000"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center font-mono text-3xl tracking-[0.4em] text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={phase === "joining"}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 text-lg font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {phase === "joining" ? "Joining…" : "Join Game"}
        </button>
      </form>
    </main>
  );
}
