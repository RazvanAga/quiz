"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Question } from "@/lib/quiz-model";
import { avatarGlyph } from "@/lib/game/avatars";
import { answerStyle, AnswerShape } from "@/lib/game/answer-style";
import { useHostAudio } from "@/lib/game/host-audio";
import { Wordmark } from "@/app/ui/brand";
import { CountdownRing } from "@/app/ui/countdown-ring";
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

// Medal glyphs for the top three of a standing; the rest show their rank number.
const MEDALS = ["🥇", "🥈", "🥉"];

const SPRING = { type: "spring" as const, stiffness: 240, damping: 22 };

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
  const [totalSecs, setTotalSecs] = useState(0);
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
      const secs = Math.ceil(answerMs / 1000);
      setTotalSecs(secs);
      setRemaining(secs);
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
        <main
          id="main"
          className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <p className="text-2xl font-semibold text-ink-200">That game is no longer active.</p>
          <a href="/admin" className="font-semibold text-lime hover:text-lime-glow">
            ← Back to the quiz library
          </a>
        </main>
      );
    }

    if ((phase === "intro" || phase === "open" || phase === "reveal") && question) {
      return (
        <main id="main" className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 py-10">
          <div className="flex items-start justify-between gap-6">
            <h1 className="font-display text-3xl font-extrabold leading-tight text-ink-100 sm:text-5xl">
              {question.text}
            </h1>
            {phase === "open" && (
              <CountdownRing remaining={remaining} total={totalSecs} size={112} stroke={9} />
            )}
          </div>

          {question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.imageUrl}
              alt="Question illustration"
              className="mx-auto mt-6 max-h-72 rounded-2xl border border-ink-800 object-contain"
            />
          )}

          {phase === "intro" ? (
            <GetReady />
          ) : (
            <>
              {phase === "open" && (
                <p className="mt-6 text-center text-lg font-semibold text-ink-300">
                  <span className="font-display font-bold text-lime">{answered}</span> / {total}{" "}
                  answered
                </p>
              )}
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {question.options.map((o, i) => {
                  const style = answerStyle(i);
                  const isCorrect = reveal?.correctOptionId === o.id;
                  const dimmed = phase === "reveal" && !isCorrect;
                  const count =
                    reveal?.distribution.counts.find((c) => c.optionId === o.id)?.count ?? 0;
                  return (
                    <motion.li
                      key={o.id}
                      style={{ "--tile-edge": style.edge } as React.CSSProperties}
                      animate={{
                        opacity: dimmed ? 0.35 : 1,
                        scale: phase === "reveal" && isCorrect ? 1.03 : 1,
                      }}
                      transition={SPRING}
                      className={`tile-shadow flex items-center gap-4 rounded-2xl px-5 py-5 text-white ${style.face} ${
                        isCorrect ? "ring-4 ring-white" : ""
                      }`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/20">
                        <AnswerShape index={i} className="h-6 w-6 text-white" />
                      </span>
                      <span className="flex-1 text-xl font-semibold">{o.text}</span>
                      {phase === "reveal" && (
                        <span className="flex items-center gap-2 font-display text-xl font-bold tabular-nums">
                          {isCorrect && <span aria-hidden>✓</span>}
                          {count}
                        </span>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
              {phase === "reveal" && (
                <>
                  <RevealFooter distribution={reveal!.distribution} />
                  <div className="mt-8 flex justify-center">
                    <HostButton onClick={() => hostAction("host:advance")} disabled={advancing}>
                      {advancing ? "…" : "Leaderboard →"}
                    </HostButton>
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
        <main id="main" className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-6 py-10">
          <h1 className="text-center font-display text-3xl font-extrabold text-ink-100 sm:text-5xl">
            Leaderboard
          </h1>
          <StandingList standings={leaderboard.standings} className="mt-8" />
          <div className="mt-10 flex justify-center">
            <HostButton
              onClick={() => hostAction(last ? "host:finish" : "host:advance")}
              disabled={advancing}
            >
              {advancing ? "…" : last ? "Final results →" : "Next question →"}
            </HostButton>
          </div>
        </main>
      );
    }

    if (phase === "podium" && podium) {
      return (
        <main id="main" className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-6 py-10">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-lime">
            Game over
          </p>
          <h1 className="mt-2 text-center font-display text-4xl font-extrabold text-ink-100 sm:text-6xl">
            🏆 Podium
          </h1>
          <StandingList standings={podium.standings} className="mt-10" celebrate />
          <div className="mt-12 text-center">
            <a href="/admin" className="font-semibold text-lime hover:text-lime-glow">
              ← Back to the quiz library
            </a>
          </div>
        </main>
      );
    }

    // Lobby.
    return (
      <main id="main" className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 py-10">
        <Wordmark className="mb-6" />
        <motion.div
          className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/70 py-12"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-lime/10 blur-3xl"
          />
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-400">
            Join at this screen&apos;s address with PIN
          </p>
          <PinDisplay pin={pin} />
        </motion.div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-ink-100">Lobby</h2>
          <div className="flex items-center gap-4">
            <p className="text-ink-400">
              <span className="font-display font-bold text-lime">{players.length}</span>{" "}
              {players.length === 1 ? "player" : "players"} in
            </p>
            <HostButton
              onClick={start}
              disabled={starting || players.length === 0 || questions.length === 0}
            >
              {starting ? "Starting…" : "Start"}
            </HostButton>
          </div>
        </div>

        {players.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-ink-800 px-6 py-16 text-center text-ink-500">
            Waiting for players to join…
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {players.map((p) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: p.connected ? 1 : 0.5, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={SPRING}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-5"
                >
                  <span className="text-5xl" aria-hidden>
                    {avatarGlyph(p.avatar)}
                  </span>
                  <span className="max-w-full truncate text-center font-semibold text-ink-100">
                    {p.name}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
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

// The Game PIN, giant on the stage — the one thing every phone in the room needs
// to read. Lime, tabular, with a soft breathing glow so it draws the eye.
function PinDisplay({ pin }: { pin: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.p
      className="font-display text-7xl font-extrabold tabular-nums tracking-[0.15em] text-lime sm:text-8xl"
      animate={reduce ? undefined : { textShadow: ["0 0 20px rgb(194 242 56 / 0.3)", "0 0 40px rgb(194 242 56 / 0.5)", "0 0 20px rgb(194 242 56 / 0.3)"] }}
      transition={{ duration: 2.4, repeat: Infinity }}
    >
      {pin}
    </motion.p>
  );
}

// The intro beat before a Question's Options appear.
function GetReady() {
  const reduce = useReducedMotion();
  return (
    <motion.p
      className="mt-16 text-center font-display text-2xl font-bold text-ink-300"
      animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.2, repeat: Infinity }}
    >
      Get ready…
    </motion.p>
  );
}

// The Host's primary control: a chunky lime pill that presses in on click.
function HostButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      className="rounded-full bg-lime px-8 py-3.5 text-lg font-bold text-ink-950 shadow-[0_6px_0_0_var(--color-lime-deep)] transition-[transform,box-shadow] active:translate-y-[3px] active:shadow-[0_3px_0_0_var(--color-lime-deep)] disabled:opacity-50"
    >
      {children}
    </motion.button>
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
      className="fixed right-4 top-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-ink-700 bg-ink-900/80 text-xl text-ink-200 shadow-lg backdrop-blur hover:bg-ink-800"
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}

// A ranked standing, shared by the interim Leaderboard and the final Podium: the
// top three wear medals (and grow, on the Podium), everyone else shows a rank.
// `layout` animates each row sliding to its new rank as scores shuffle.
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
      <AnimatePresence initial={false}>
        {standings.map((s, i) => {
          const medal = s.rank <= 3 ? MEDALS[s.rank - 1] : null;
          const top = celebrate && s.rank === 1;
          return (
            <motion.li
              key={s.playerId}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, ...SPRING }}
              className={`flex items-center gap-4 rounded-2xl border px-5 text-ink-100 ${
                medal ? "border-lime/40 bg-lime/10" : "border-ink-800 bg-ink-900/60"
              } ${top ? "py-6" : "py-4"}`}
            >
              <span className="w-10 text-center font-display text-2xl font-bold tabular-nums">
                {medal ?? s.rank}
              </span>
              <span className="text-3xl" aria-hidden>
                {avatarGlyph(s.avatar)}
              </span>
              <span className={`flex-1 truncate font-bold ${top ? "text-2xl" : "text-lg"}`}>
                {s.name}
              </span>
              <span className="font-display text-xl font-bold tabular-nums text-lime">
                {s.score}
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

// The count of Players who didn't answer, shown under the Reveal so the room
// splits add up.
function RevealFooter({ distribution }: { distribution: Distribution }) {
  if (distribution.noAnswer === 0) return null;
  return (
    <p className="mt-4 text-center text-sm text-ink-500">
      {distribution.noAnswer} didn&apos;t answer
    </p>
  );
}
