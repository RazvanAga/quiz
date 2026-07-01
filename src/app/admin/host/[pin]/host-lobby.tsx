"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/quiz-model";
import { avatarGlyph } from "@/lib/game/avatars";
import {
  getSocket,
  type Distribution,
  type LobbyPlayer,
  type PlayQuestion,
  type QuestionBegin,
  type QuestionReveal,
} from "@/lib/game/socket-client";

// The Host's shared screen for one Game (PRD stories 18, 20, 21, 34, 39, 40): the
// Lobby with its Game PIN and Players popping in live, a Start control, then per
// Question an intro beat → Options with a countdown and a live answered-count →
// the Reveal with the correct Option and the Distribution. Leaderboard/Podium
// and advancing to the next Question land in #7; here we play one Question.

// Kahoot-style Option accents, assigned by position.
const OPTION_ACCENTS = [
  "bg-rose-600",
  "bg-sky-600",
  "bg-amber-500",
  "bg-emerald-600",
];

type Phase = "lobby" | "intro" | "open" | "reveal";

export function HostGame({ pin, questions }: { pin: string; questions: Question[] }) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [status, setStatus] = useState<"attaching" | "live" | "gone">("attaching");
  const [phase, setPhase] = useState<Phase>("lobby");
  const [starting, setStarting] = useState(false);

  const [question, setQuestion] = useState<PlayQuestion | null>(null);
  const [answered, setAnswered] = useState(0);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);

  // Timers the intro beat and the countdown run on; cleared on teardown so a new
  // Question (or unmount) never leaves a stale tick behind.
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    function attach() {
      socket.emit(
        "host:attach",
        { pin },
        (res: { ok: true; players: LobbyPlayer[] } | { ok: false; error: string }) => {
          if (!res.ok) return setStatus("gone");
          setPlayers(res.players);
          setStatus("live");
        },
      );
    }

    function onLobbyUpdate({ players }: { players: LobbyPlayer[] }) {
      setPlayers(players);
    }

    function onBegin(data: QuestionBegin) {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
      setReveal(null);
      setAnswered(0);
      setTotal(data.total);
      setQuestion(data.question);
      setPhase("intro");
      // After the intro beat, Options become live and the countdown starts.
      introTimer.current = setTimeout(() => {
        setPhase("open");
        const deadline = Date.now() + data.answerMs;
        setRemaining(Math.ceil(data.answerMs / 1000));
        tick.current = setInterval(() => {
          setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        }, 200);
      }, data.introMs);
    }

    function onProgress({ answered, total }: { answered: number; total: number }) {
      setAnswered(answered);
      setTotal(total);
    }

    function onReveal(data: QuestionReveal) {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
      setReveal(data);
      setPhase("reveal");
    }

    attach();
    socket.on("connect", attach);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("question:begin", onBegin);
    socket.on("question:progress", onProgress);
    socket.on("question:reveal", onReveal);
    return () => {
      socket.off("connect", attach);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("question:begin", onBegin);
      socket.off("question:progress", onProgress);
      socket.off("question:reveal", onReveal);
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
    };
  }, [pin]);

  function start() {
    setStarting(true);
    const hostToken = localStorage.getItem(`quiz:hostToken:${pin}`) ?? "";
    getSocket().emit(
      "host:startGame",
      { pin, hostToken, questions },
      (res: { ok: true } | { ok: false; error: string }) => {
        setStarting(false);
        if (!res.ok) window.alert(res.error);
      },
    );
  }

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

  if (phase !== "lobby" && question) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">{question.text}</h1>
          {phase === "open" && (
            <div className="flex shrink-0 flex-col items-center">
              <span className="font-mono text-6xl font-black tabular-nums text-emerald-400">
                {remaining}
              </span>
              <span className="text-xs uppercase tracking-widest text-slate-500">seconds</span>
            </div>
          )}
        </div>

        {question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.imageUrl}
            alt=""
            className="mx-auto mt-6 max-h-72 rounded-2xl object-contain"
          />
        )}

        {phase === "intro" ? (
          <p className="mt-16 text-center text-2xl font-semibold text-slate-400">
            Get ready…
          </p>
        ) : (
          <>
            {phase === "open" && (
              <p className="mt-6 text-center text-lg font-semibold text-slate-300">
                {answered} / {total} answered
              </p>
            )}
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {question.options.map((o, i) => {
                const isCorrect = reveal?.correctOptionId === o.id;
                const dimmed = phase === "reveal" && !isCorrect;
                const count =
                  reveal?.distribution.counts.find((c) => c.optionId === o.id)?.count ?? 0;
                return (
                  <li
                    key={o.id}
                    className={`flex items-center gap-4 rounded-2xl px-5 py-5 text-white transition ${
                      OPTION_ACCENTS[i % OPTION_ACCENTS.length]
                    } ${dimmed ? "opacity-40" : ""} ${
                      isCorrect ? "ring-4 ring-emerald-300" : ""
                    }`}
                  >
                    <span className="text-xl font-black">{String.fromCharCode(65 + i)}</span>
                    <span className="flex-1 text-lg font-semibold">{o.text}</span>
                    {phase === "reveal" && (
                      <span className="flex items-center gap-2 font-mono text-lg">
                        {isCorrect && <span aria-hidden>✓</span>}
                        {count}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {phase === "reveal" && <RevealFooter distribution={reveal!.distribution} />}
          </>
        )}
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

      <div className="mt-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Lobby</h1>
        <div className="flex items-center gap-4">
          <p className="text-slate-400">
            {players.length} {players.length === 1 ? "Player" : "Players"} in
          </p>
          <button
            type="button"
            onClick={start}
            disabled={starting || players.length === 0 || questions.length === 0}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start"}
          </button>
        </div>
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

// The count of Players who didn't answer, shown under the Reveal so the room
// splits add up.
function RevealFooter({ distribution }: { distribution: Distribution }) {
  if (distribution.noAnswer === 0) return null;
  return (
    <p className="mt-4 text-center text-sm text-slate-500">
      {distribution.noAnswer} didn&apos;t answer
    </p>
  );
}
