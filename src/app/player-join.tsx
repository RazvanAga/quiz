"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AVATARS, avatarGlyph } from "@/lib/game/avatars";
import { answerStyle, AnswerShape } from "@/lib/game/answer-style";
import { Wordmark } from "./ui/brand";
import { CountdownRing } from "./ui/countdown-ring";
import {
  getSocket,
  getPlayerId,
  rememberPin,
  recallPin,
  forgetPin,
  type LeaderboardUpdate,
  type LobbyPlayer,
  type PlayQuestion,
  type Podium,
  type QuestionBegin,
  type QuestionReveal,
  type ResumeSnapshot,
  type Standing,
  type YouResult,
} from "@/lib/game/socket-client";

// The Player site (PRD stories 22-38, 41): set a display name, pick a preset
// Avatar, enter a Game PIN, wait in the Lobby, then play — each Question shows
// its text (and image) for a beat, its Options become tappable with a countdown,
// a tap locks instantly, and the Reveal shows right/wrong + points gained. A
// wrong/expired PIN, a taken name, or a Game that already started come back as a
// clear message.

type Phase =
  | "form"
  | "joining"
  | "lobby"
  | "intro"
  | "open"
  | "answered"
  | "reveal"
  | "leaderboard"
  | "podium";

const SPRING = { type: "spring" as const, stiffness: 260, damping: 22 };

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
  const [totalSecs, setTotalSecs] = useState(0);
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);
  const [result, setResult] = useState<YouResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUpdate | null>(null);
  const [podium, setPodium] = useState<Podium | null>(null);

  const joined = phase !== "form" && phase !== "joining";
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start the answering countdown once a Question's Options are tappable.
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

  // Play a Question's intro beat then its countdown — shared by the live
  // question:begin event and a mid-Question resume (which passes the windows
  // that remain, so a reload rejoins the same countdown).
  function beginQuestionUI(q: PlayQuestion, introMs: number, answerMs: number) {
    if (introTimer.current) clearTimeout(introTimer.current);
    if (tick.current) clearInterval(tick.current);
    setReveal(null);
    setResult(null);
    setChosen(null);
    setQuestion(q);
    if (introMs > 0) {
      setPhase("intro");
      introTimer.current = setTimeout(() => startTick(answerMs), introMs);
    } else {
      startTick(answerMs);
    }
  }

  // Resume whatever screen the Game is on after a reload: re-attach to the same
  // Player (score/rank intact) and repaint their phone mid-Game (PRD story 46).
  function applyResume(snap: ResumeSnapshot, you?: { name: string; avatar: string }) {
    setPlayers(snap.players);
    if (you) {
      setName(you.name);
      setAvatar(you.avatar);
    }
    if (snap.status === "question" && snap.question) {
      beginQuestionUI(snap.question, snap.introMs ?? 0, snap.answerMs ?? 0);
    } else if (snap.status === "reveal" && snap.question && snap.reveal) {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
      setQuestion(snap.question);
      setReveal(snap.reveal);
      setChosen(snap.chosen ?? null);
      setResult(snap.youResult ?? null);
      setPhase("reveal");
    } else if (snap.status === "leaderboard" && snap.leaderboard) {
      setLeaderboard(snap.leaderboard);
      setPhase("leaderboard");
    } else if (snap.status === "podium" && snap.podium) {
      forgetPin();
      setPodium(snap.podium);
      setPhase("podium");
    } else {
      setPhase("lobby");
    }
  }

  // On a fresh page load (a phone reload mid-Game), try to re-attach to the
  // last Game this browser was in, keyed by the localStorage playerId + PIN. A
  // stale PIN (the Game finished or was reclaimed) just falls back to the form.
  useEffect(() => {
    const storedPin = recallPin();
    if (!storedPin) return;
    getSocket().emit(
      "player:reconnect",
      { pin: storedPin, playerId: getPlayerId() },
      (
        res:
          | { ok: true; you?: LobbyPlayer; snapshot: ResumeSnapshot }
          | { ok: false; error: string },
      ) => {
        if (!res.ok) return forgetPin();
        setPin(storedPin);
        applyResume(res.snapshot, res.you);
      },
    );
    // Runs once on mount; the helpers it calls close over stable setters/refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once joined, listen for the roster and the Question lifecycle for the rest
  // of the Game (the listeners outlive each phase, so they attach just once).
  useEffect(() => {
    if (!joined) return;
    const socket = getSocket();

    // A network blip drops then re-opens the socket without reloading the page,
    // so React state is intact; we only need to re-attach to the room (and light
    // back up in the roster). We deliberately don't apply the resume snapshot
    // here, so an in-flight local phase (e.g. just-answered) isn't clobbered.
    function rejoin() {
      if (!pin) return;
      socket.emit("player:reconnect", { pin, playerId: getPlayerId() }, () => {});
    }

    function onLobbyUpdate({ players }: { players: LobbyPlayer[] }) {
      setPlayers(players);
    }

    function onBegin(data: QuestionBegin) {
      beginQuestionUI(data.question, data.introMs, data.answerMs);
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

    function onLeaderboard(data: LeaderboardUpdate) {
      setLeaderboard(data);
      setPhase("leaderboard");
    }

    function onPodium(data: Podium) {
      // The Game is over (and the server evicts it), so drop the stored PIN —
      // a later visit lands on the join form, not a reconnect to a dead Game.
      forgetPin();
      setPodium(data);
      setPhase("podium");
    }

    socket.on("connect", rejoin);
    socket.on("lobby:update", onLobbyUpdate);
    socket.on("question:begin", onBegin);
    socket.on("question:reveal", onReveal);
    socket.on("you:result", onResult);
    socket.on("game:leaderboard", onLeaderboard);
    socket.on("game:podium", onPodium);
    return () => {
      socket.off("connect", rejoin);
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("question:begin", onBegin);
      socket.off("question:reveal", onReveal);
      socket.off("you:result", onResult);
      socket.off("game:leaderboard", onLeaderboard);
      socket.off("game:podium", onPodium);
      if (introTimer.current) clearTimeout(introTimer.current);
      if (tick.current) clearInterval(tick.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Remember the PIN so a reload can re-attach to this Game (#9).
        rememberPin(pin);
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

  // The final Podium: the Player's own placement, celebrated, over the full
  // ranking so they can see who beat them (PRD story 45).
  if (phase === "podium" && podium) {
    return <PlacementScreen standings={podium.standings} title="Game over" final />;
  }

  // The interim Leaderboard between Questions: where the Player stands right now.
  if (phase === "leaderboard" && leaderboard) {
    return <PlacementScreen standings={leaderboard.standings} title="Leaderboard" />;
  }

  // Playing a Question: intro beat, then tappable Options, then the Reveal.
  if (question && (phase === "intro" || phase === "open" || phase === "answered" || phase === "reveal")) {
    return (
      <main id="main" className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold leading-snug text-ink-100">{question.text}</h1>
          {phase === "open" && <CountdownRing remaining={remaining} total={totalSecs} size={58} stroke={5} />}
        </div>

        {question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.imageUrl}
            alt="Question illustration"
            className="mx-auto mt-4 max-h-48 rounded-2xl border border-ink-800 object-contain"
          />
        )}

        {phase === "reveal" ? (
          <PlayerResult reveal={reveal!} chosen={chosen} result={result} question={question} />
        ) : phase === "intro" ? (
          <GetReady />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3">
              {question.options.map((o, i) => {
                const isChosen = chosen === o.id;
                const style = answerStyle(i);
                return (
                  <motion.button
                    key={o.id}
                    type="button"
                    onClick={() => tap(o.id)}
                    disabled={phase !== "open"}
                    aria-pressed={isChosen}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: phase === "answered" && !isChosen ? 0.35 : 1, y: 0 }}
                    transition={{ delay: i * 0.05, ...SPRING }}
                    whileTap={phase === "open" ? { scale: 0.97 } : undefined}
                    style={{ "--tile-edge": style.edge } as React.CSSProperties}
                    className={`tile-shadow flex items-center gap-4 rounded-2xl px-5 py-5 text-left text-white transition-[transform,box-shadow] active:translate-y-[3px] active:[box-shadow:0_3px_0_0_var(--tile-edge)] ${style.face} ${
                      isChosen ? "ring-4 ring-white" : ""
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/20">
                      <AnswerShape index={i} className="h-5 w-5 text-white" />
                    </span>
                    <span className="flex-1 text-lg font-semibold">{o.text}</span>
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence>
              {phase === "answered" && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={SPRING}
                  className="mt-6 text-center text-lg font-bold text-lime"
                >
                  Locked in!
                </motion.p>
              )}
            </AnimatePresence>
          </>
        )}
      </main>
    );
  }

  if (phase === "lobby") {
    return (
      <main
        id="main"
        className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center"
      >
        <motion.span
          className="animate-float text-7xl"
          aria-hidden
          initial={{ scale: 0, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={SPRING}
        >
          {avatarGlyph(avatar)}
        </motion.span>
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-100">
            You&apos;re in, {name.trim()}!
          </h1>
          <p className="mt-2 text-ink-400">Hang tight. The host starts the game soon.</p>
        </div>
        <div className="w-full rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-lime">
            {players.length} {players.length === 1 ? "player" : "players"} in the lobby
          </p>
          <ul className="flex flex-wrap justify-center gap-3">
            <AnimatePresence mode="popLayout">
              {players.map((p) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={SPRING}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="text-3xl" aria-hidden>
                    {avatarGlyph(p.avatar)}
                  </span>
                  <span className="max-w-20 truncate text-xs text-ink-300">{p.name}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-6 py-12"
    >
      <motion.header
        className="text-center"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Wordmark className="mb-6" />
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink-100">
          Join the game
        </h1>
        <p className="mt-2 text-ink-400">Pick a name and an avatar, then punch in the PIN.</p>
      </motion.header>

      <motion.form
        onSubmit={join}
        className="space-y-6"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
      >
        <Field>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-ink-300">
            Display name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            required
            placeholder="e.g. Ada"
            className="w-full rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-lg text-ink-100 placeholder:text-ink-500 focus:border-lime focus:outline-none"
          />
        </Field>

        <Field>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-300">Avatar</legend>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <motion.button
                  key={a.id}
                  type="button"
                  onClick={() => setAvatar(a.id)}
                  aria-label={a.label}
                  aria-pressed={avatar === a.id}
                  whileTap={{ scale: 0.9 }}
                  className={`flex aspect-square items-center justify-center rounded-xl border text-2xl transition ${
                    avatar === a.id
                      ? "border-lime bg-lime/15"
                      : "border-ink-800 bg-ink-900 hover:border-ink-600"
                  }`}
                >
                  <span aria-hidden>{a.glyph}</span>
                </motion.button>
              ))}
            </div>
          </fieldset>
        </Field>

        <Field>
          <label htmlFor="pin" className="mb-2 block text-sm font-semibold text-ink-300">
            Game PIN
          </label>
          <input
            id="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="\d{4}"
            placeholder="0000"
            className="w-full rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-center font-display text-4xl font-bold tabular-nums tracking-[0.35em] text-lime placeholder:text-ink-700 focus:border-lime focus:outline-none"
          />
        </Field>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-wrong/40 bg-wrong/10 px-4 py-3 text-sm font-medium text-wrong"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Field>
          <motion.button
            type="submit"
            disabled={phase === "joining"}
            whileTap={{ scale: 0.98 }}
            className="w-full rounded-full bg-lime px-6 py-4 text-lg font-bold text-ink-950 shadow-[0_6px_0_0_var(--color-lime-deep)] transition-[transform,box-shadow] active:translate-y-[3px] active:shadow-[0_3px_0_0_var(--color-lime-deep)] disabled:opacity-60"
          >
            {phase === "joining" ? "Joining…" : "Join game"}
          </motion.button>
        </Field>
      </motion.form>
    </main>
  );
}

// One entrance-staggered form row.
function Field({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
      {children}
    </motion.div>
  );
}

// The intro beat: a pulsing "Get ready" so the phone doesn't look frozen before
// the Options light up.
function GetReady() {
  const reduce = useReducedMotion();
  return (
    <motion.p
      className="mt-16 text-center font-display text-xl font-bold text-ink-300"
      animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.2, repeat: Infinity }}
    >
      Get ready…
    </motion.p>
  );
}

// Medal glyphs for the top three; lower ranks show their number instead.
const MEDALS = ["🥇", "🥈", "🥉"];

// A Player's own placement (PRD stories 42, 45): their rank called out big — the
// interim Leaderboard between Questions and the final Podium share this — over a
// compact full ranking so they can see the rest of the room.
function PlacementScreen({
  standings,
  title,
  final = false,
}: {
  standings: Standing[];
  title: string;
  final?: boolean;
}) {
  const me = standings.find((s) => s.playerId === getPlayerId());
  const medal = me && me.rank <= 3 ? MEDALS[me.rank - 1] : null;

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center gap-6 px-6 py-10 text-center"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-lime">
        {final ? "🏆 " : ""}
        {title}
      </p>

      {me ? (
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
        >
          <span className="text-6xl" aria-hidden>
            {medal ?? avatarGlyph(me.avatar)}
          </span>
          <p className="font-display text-4xl font-extrabold text-ink-100">
            {final ? "You finished" : "You're"} #{me.rank}
          </p>
          <p className="text-lg font-semibold text-ink-400">
            of {standings.length} · {me.score} pts
          </p>
        </motion.div>
      ) : (
        <p className="text-2xl font-bold text-ink-300">Standings</p>
      )}

      <ol className="mt-2 flex w-full flex-col gap-2">
        {standings.map((s, i) => {
          const isMe = s.playerId === getPlayerId();
          const rowMedal = s.rank <= 3 ? MEDALS[s.rank - 1] : null;
          return (
            <motion.li
              key={s.playerId}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, ...SPRING }}
              className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left ${
                isMe ? "border-lime bg-lime/10" : "border-ink-800 bg-ink-900/60"
              }`}
            >
              <span className="w-7 text-center text-lg font-bold tabular-nums text-ink-300">
                {rowMedal ?? s.rank}
              </span>
              <span className="text-2xl" aria-hidden>
                {avatarGlyph(s.avatar)}
              </span>
              <span className="flex-1 truncate font-semibold text-ink-100">{s.name}</span>
              <span className="font-display font-bold tabular-nums text-lime">{s.score}</span>
            </motion.li>
          );
        })}
      </ol>

      {!final && <p className="mt-2 text-sm text-ink-500">Hang tight. The host continues soon.</p>}
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
    <motion.div
      className="mt-10 flex flex-col items-center gap-4 text-center"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
    >
      {chosen == null ? (
        <p className="font-display text-3xl font-bold text-ink-300">Time&apos;s up!</p>
      ) : correct ? (
        <p className="font-display text-4xl font-extrabold text-correct">Correct! 🎉</p>
      ) : (
        <p className="font-display text-4xl font-extrabold text-wrong">Wrong</p>
      )}

      <p className="text-2xl font-bold text-ink-100">+{result?.pointsGained ?? 0} pts</p>

      {!correct && (
        <p className="text-ink-400">
          The answer was <span className="font-semibold text-correct">{correctText}</span>
        </p>
      )}

      {result && (
        <p className="mt-2 text-sm uppercase tracking-widest text-ink-500">
          {result.totalScore} total
        </p>
      )}
    </motion.div>
  );
}
