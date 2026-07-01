"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/quiz-model";
import { avatarGlyph } from "@/lib/game/avatars";
import { useHostAudio } from "@/lib/game/host-audio";
import {
  getSocket,
  type Distribution,
  type LeaderboardUpdate,
  type LobbyPlayer,
  type PlayQuestion,
  type Podium,
  type QuestionBegin,
  type QuestionReveal,
  type ResumeSnapshot,
  type Standing,
} from "@/lib/game/socket-client";

// The Host's shared screen for one Game (PRD stories 18, 20, 21, 34, 39, 40): the
// Lobby with its Game PIN and Players popping in live, a Start control, then per
// Question an intro beat → Options with a countdown and a live answered-count →
// the Reveal with the correct Option and the Distribution. After each Reveal the
// Host clicks Next for the interim Leaderboard, then again to advance; after the
// last Question the Game reaches its final Podium (top-3 + full ranking).

// Kahoot-style Option accents, assigned by position.
const OPTION_ACCENTS = [
  "bg-rose-600",
  "bg-sky-600",
  "bg-amber-500",
  "bg-emerald-600",
];

// Medal glyphs for the top three of a standing; the rest show their rank number.
const MEDALS = ["🥇", "🥈", "🥉"];

type Phase = "lobby" | "intro" | "open" | "reveal" | "leaderboard" | "podium";

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
  const [leaderboard, setLeaderboard] = useState<LeaderboardUpdate | null>(null);
  const [podium, setPodium] = useState<Podium | null>(null);
  const [advancing, setAdvancing] = useState(false);

  // Host-screen sound, with the mute preference remembered across reloads.
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(localStorage.getItem("quiz:hostMuted") === "1");
  }, []);
  function toggleMuted() {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem("quiz:hostMuted", next ? "1" : "0");
      return next;
    });
  }
  useHostAudio(phase, muted);

  // Timers the intro beat and the countdown run on; cleared on teardown so a new
  // Question (or unmount) never leaves a stale tick behind.
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    // Start the answering countdown once a Question's Options are live.
    function startTick(answerMs: number) {
      setPhase("open");
      const deadline = Date.now() + answerMs;
      setRemaining(Math.ceil(answerMs / 1000));
      tick.current = setInterval(() => {
        setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      }, 200);
    }

    // Show a Question's intro beat then its countdown — shared by the live
    // question:begin event and a mid-Question resume (which passes the windows
    // that remain, so a reload rejoins the same countdown rather than restarting
    // the intro).
    function beginQuestionUI(
      q: PlayQuestion,
      introMs: number,
      answerMs: number,
      totalCount: number,
      answeredCount = 0,
    ) {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
      setReveal(null);
      setLeaderboard(null);
      setAnswered(answeredCount);
      setTotal(totalCount);
      setQuestion(q);
      if (introMs > 0) {
        setPhase("intro");
        introTimer.current = setTimeout(() => startTick(answerMs), introMs);
      } else {
        startTick(answerMs);
      }
    }

    // Resume whatever screen the Game is on after a (re)connect or a reload,
    // proving ownership with the host token (#9).
    function applyResume(snap: ResumeSnapshot) {
      setPlayers(snap.players);
      setStatus("live");
      if (snap.status === "question" && snap.question) {
        beginQuestionUI(
          snap.question,
          snap.introMs ?? 0,
          snap.answerMs ?? 0,
          snap.total ?? 0,
          snap.answered ?? 0,
        );
      } else if (snap.status === "reveal" && snap.question && snap.reveal) {
        if (introTimer.current) clearTimeout(introTimer.current);
        if (tick.current) clearInterval(tick.current);
        setQuestion(snap.question);
        setReveal(snap.reveal);
        setPhase("reveal");
      } else if (snap.status === "leaderboard" && snap.leaderboard) {
        setLeaderboard(snap.leaderboard);
        setPhase("leaderboard");
      } else if (snap.status === "podium" && snap.podium) {
        setPodium(snap.podium);
        setPhase("podium");
      } else {
        setPhase("lobby");
      }
    }

    function reconnect() {
      const hostToken = localStorage.getItem(`quiz:hostToken:${pin}`) ?? "";
      socket.emit(
        "host:reconnect",
        { pin, hostToken },
        (res: { ok: true; snapshot: ResumeSnapshot } | { ok: false; error: string }) => {
          if (!res.ok) return setStatus("gone");
          applyResume(res.snapshot);
        },
      );
    }

    function onLobbyUpdate({ players }: { players: LobbyPlayer[] }) {
      setPlayers(players);
    }

    function onBegin(data: QuestionBegin) {
      beginQuestionUI(data.question, data.introMs, data.answerMs, data.total);
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

    function onLeaderboard(data: LeaderboardUpdate) {
      setLeaderboard(data);
      setPhase("leaderboard");
    }

    function onPodium(data: Podium) {
      setPodium(data);
      setPhase("podium");
    }

    reconnect();
    socket.on("connect", reconnect);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("question:begin", onBegin);
    socket.on("question:progress", onProgress);
    socket.on("question:reveal", onReveal);
    socket.on("game:leaderboard", onLeaderboard);
    socket.on("game:podium", onPodium);
    return () => {
      socket.off("connect", reconnect);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("question:begin", onBegin);
      socket.off("question:progress", onProgress);
      socket.off("question:reveal", onReveal);
      socket.off("game:leaderboard", onLeaderboard);
      socket.off("game:podium", onPodium);
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

  // The Host's "Next"/"Finish" controls after a Question: the server decides
  // which transition applies, so both share this one caller.
  function hostAction(event: "host:advance" | "host:finish") {
    setAdvancing(true);
    const hostToken = localStorage.getItem(`quiz:hostToken:${pin}`) ?? "";
    getSocket().emit(
      event,
      { pin, hostToken },
      (res: { ok: true } | { ok: false; error: string }) => {
        setAdvancing(false);
        if (!res.ok) window.alert(res.error);
      },
    );
  }

  function screen() {
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

  if ((phase === "intro" || phase === "open" || phase === "reveal") && question) {
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
            {phase === "reveal" && (
              <>
                <RevealFooter distribution={reveal!.distribution} />
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => hostAction("host:advance")}
                    disabled={advancing}
                    className="rounded-xl bg-emerald-600 px-8 py-3 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {advancing ? "…" : "Leaderboard →"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </main>
    );
  }

  if (phase === "leaderboard" && leaderboard) {
    const last = !leaderboard.hasNext;
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
        <h1 className="text-center text-3xl font-black sm:text-4xl">Leaderboard</h1>
        <StandingList standings={leaderboard.standings} className="mt-8" />
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => hostAction(last ? "host:finish" : "host:advance")}
            disabled={advancing}
            className="rounded-xl bg-emerald-600 px-8 py-3 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {advancing ? "…" : last ? "Final results →" : "Next Question →"}
          </button>
        </div>
      </main>
    );
  }

  if (phase === "podium" && podium) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          Game over
        </p>
        <h1 className="mt-2 text-center text-4xl font-black sm:text-5xl">🏆 Podium</h1>
        <StandingList standings={podium.standings} className="mt-10" celebrate />
        <div className="mt-12 text-center">
          <a href="/admin" className="text-indigo-400 hover:text-indigo-300">
            ← Back to the Quiz library
          </a>
        </div>
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

  return (
    <>
      {screen()}
      <MuteToggle muted={muted} onToggle={toggleMuted} />
    </>
  );
}

// A fixed, always-on-screen control to silence (or restore) the Host audio.
function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Unmute sound" : "Mute sound"}
      className="fixed right-4 top-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-xl text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800"
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}

// A ranked standing, shared by the interim Leaderboard and the final Podium: the
// top three wear medals (and grow, on the Podium), everyone else shows a rank.
function StandingList({
  standings,
  className = "",
  celebrate = false,
}: {
  standings: Standing[];
  className?: string;
  celebrate?: boolean;
}) {
  return (
    <ol className={`flex flex-col gap-3 ${className}`}>
      {standings.map((s) => {
        const medal = s.rank <= 3 ? MEDALS[s.rank - 1] : null;
        const top = celebrate && s.rank === 1;
        return (
          <li
            key={s.playerId}
            className={`flex items-center gap-4 rounded-2xl border px-5 text-slate-100 ${
              medal
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-slate-800 bg-slate-900/60"
            } ${top ? "py-6" : "py-4"}`}
          >
            <span className="w-10 text-center text-2xl font-black tabular-nums">
              {medal ?? s.rank}
            </span>
            <span className="text-3xl" aria-hidden>
              {avatarGlyph(s.avatar)}
            </span>
            <span className={`flex-1 truncate font-bold ${top ? "text-2xl" : "text-lg"}`}>
              {s.name}
            </span>
            <span className="font-mono text-xl font-black tabular-nums text-emerald-400">
              {s.score}
            </span>
          </li>
        );
      })}
    </ol>
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
