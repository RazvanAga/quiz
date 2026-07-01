"use client";

import { useEffect, useRef, useState } from "react";
import { AVATARS, avatarGlyph } from "@/lib/game/avatars";
import {
  getSocket,
  getPlayerId,
  type LobbyPlayer,
  type PlayQuestion,
  type QuestionBegin,
  type QuestionReveal,
  type YouResult,
} from "@/lib/game/socket-client";

// The Player site (PRD stories 22-38, 41): set a display name, pick a preset
// Avatar, enter a Game PIN, wait in the Lobby, then play — each Question shows
// its text (and image) for a beat, its Options become tappable with a countdown,
// a tap locks instantly, and the Reveal shows right/wrong + points gained. A
// wrong/expired PIN, a taken name, or a Game that already started come back as a
// clear message.

// Option accents, matched to the Host screen so a Player can call out "the blue
// one" across the room.
const OPTION_ACCENTS = [
  "bg-rose-600",
  "bg-sky-600",
  "bg-amber-500",
  "bg-emerald-600",
];

type Phase = "form" | "joining" | "lobby" | "intro" | "open" | "answered" | "reveal";

export function PlayerJoin() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0].id);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);

  const [question, setQuestion] = useState<PlayQuestion | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);
  const [result, setResult] = useState<YouResult | null>(null);

  const joined = phase !== "form" && phase !== "joining";
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Once joined, listen for the roster and the Question lifecycle for the rest
  // of the Game (the listeners outlive each phase, so they attach just once).
  useEffect(() => {
    if (!joined) return;
    const socket = getSocket();

    function onLobbyUpdate({ players }: { players: LobbyPlayer[] }) {
      setPlayers(players);
    }

    function onBegin(data: QuestionBegin) {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
      setReveal(null);
      setResult(null);
      setChosen(null);
      setQuestion(data.question);
      setPhase("intro");
      introTimer.current = setTimeout(() => {
        setPhase("open");
        const deadline = Date.now() + data.answerMs;
        setRemaining(Math.ceil(data.answerMs / 1000));
        tick.current = setInterval(() => {
          setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        }, 200);
      }, data.introMs);
    }

    function onReveal(data: QuestionReveal) {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
      setReveal(data);
      setPhase("reveal");
    }

    function onResult(data: YouResult) {
      setResult(data);
    }

    socket.on("lobby:update", onLobbyUpdate);
    socket.on("question:begin", onBegin);
    socket.on("question:reveal", onReveal);
    socket.on("you:result", onResult);
    return () => {
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("question:begin", onBegin);
      socket.off("question:reveal", onReveal);
      socket.off("you:result", onResult);
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
    };
  }, [joined]);

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

  // A tap locks instantly (no submit step): optimistically show it locked while
  // the engine records and scores it.
  function tap(optionId: string) {
    if (phase !== "open") return;
    setChosen(optionId);
    setPhase("answered");
    getSocket().emit("player:submitResponse", { pin, playerId: getPlayerId(), optionId });
  }

  // Playing a Question: intro beat, then tappable Options, then the Reveal.
  if (question && (phase === "intro" || phase === "open" || phase === "answered" || phase === "reveal")) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-black leading-snug">{question.text}</h1>
          {phase === "open" && (
            <span className="font-mono text-3xl font-black tabular-nums text-emerald-400">
              {remaining}
            </span>
          )}
        </div>

        {question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={question.imageUrl} alt="" className="mx-auto mt-4 max-h-48 rounded-xl object-contain" />
        )}

        {phase === "reveal" ? (
          <PlayerResult reveal={reveal!} chosen={chosen} result={result} question={question} />
        ) : phase === "intro" ? (
          <p className="mt-16 text-center text-lg font-semibold text-slate-400">Get ready…</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3">
              {question.options.map((o, i) => {
                const isChosen = chosen === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => tap(o.id)}
                    disabled={phase !== "open"}
                    aria-pressed={isChosen}
                    className={`flex items-center gap-4 rounded-2xl px-5 py-6 text-left text-white transition ${
                      OPTION_ACCENTS[i % OPTION_ACCENTS.length]
                    } ${phase === "answered" && !isChosen ? "opacity-40" : ""} ${
                      isChosen ? "ring-4 ring-white" : ""
                    }`}
                  >
                    <span className="text-lg font-black">{String.fromCharCode(65 + i)}</span>
                    <span className="flex-1 text-lg font-semibold">{o.text}</span>
                  </button>
                );
              })}
            </div>
            {phase === "answered" && (
              <p className="mt-6 text-center text-lg font-bold text-emerald-400">Locked in!</p>
            )}
          </>
        )}
      </main>
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

// The Player's personal Reveal (PRD story 41): right/wrong + points gained, with
// the correct Option called out so they learn the answer.
function PlayerResult({
  reveal,
  chosen,
  result,
  question,
}: {
  reveal: QuestionReveal;
  chosen: string | null;
  result: YouResult | null;
  question: PlayQuestion;
}) {
  const correct = chosen != null && chosen === reveal.correctOptionId;
  const correctText = question.options.find((o) => o.id === reveal.correctOptionId)?.text;

  return (
    <div className="mt-10 flex flex-col items-center gap-4 text-center">
      {chosen == null ? (
        <p className="text-3xl font-black text-slate-300">Time&apos;s up!</p>
      ) : correct ? (
        <p className="text-4xl font-black text-emerald-400">Correct! 🎉</p>
      ) : (
        <p className="text-4xl font-black text-rose-400">Wrong</p>
      )}

      <p className="text-2xl font-bold text-slate-100">
        +{result?.pointsGained ?? 0} points
      </p>

      {!correct && (
        <p className="text-slate-400">
          The answer was <span className="font-semibold text-emerald-400">{correctText}</span>
        </p>
      )}

      {result && (
        <p className="mt-2 text-sm uppercase tracking-widest text-slate-500">
          {result.totalScore} total
        </p>
      )}
    </div>
  );
}
