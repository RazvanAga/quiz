import { useEffect, useRef } from "react";

// Host-only audio for the shared screen (PRD "Host-screen sound"): a looping
// lobby bed while Players join, a ticking-tension loop during the answer
// countdown, and a one-shot sting on the Reveal. Player phones never mount this
// hook, so their devices stay silent.
//
// Browsers block audio until the page has seen a user gesture, so a first
// pointer/key interaction anywhere re-syncs whatever loop should be playing —
// the Host clicking into the page (or the mute toggle) unlocks the lobby bed.

type Phase = "lobby" | "intro" | "open" | "reveal" | "leaderboard" | "podium";

const SOUNDS = {
  lobby: { src: "/sounds/lobby.wav", volume: 0.45, loop: true },
  tick: { src: "/sounds/tick.wav", volume: 0.6, loop: true },
  reveal: { src: "/sounds/reveal.wav", volume: 0.7, loop: false },
} as const;

function syncLoop(el: HTMLAudioElement, want: boolean) {
  if (want) {
    if (el.paused) {
      el.currentTime = 0;
      void el.play().catch(() => {});
    }
  } else if (!el.paused) {
    el.pause();
    el.currentTime = 0;
  }
}

export function useHostAudio(phase: Phase, muted: boolean) {
  const lobby = useRef<HTMLAudioElement | null>(null);
  const tick = useRef<HTMLAudioElement | null>(null);
  const reveal = useRef<HTMLAudioElement | null>(null);
  const prevPhase = useRef<Phase | null>(null);
  const resync = useRef<() => void>(() => {});

  // Build the elements once and unlock playback on the first user gesture.
  useEffect(() => {
    lobby.current = Object.assign(new Audio(SOUNDS.lobby.src), {
      loop: true,
      volume: SOUNDS.lobby.volume,
    });
    tick.current = Object.assign(new Audio(SOUNDS.tick.src), {
      loop: true,
      volume: SOUNDS.tick.volume,
    });
    reveal.current = Object.assign(new Audio(SOUNDS.reveal.src), {
      volume: SOUNDS.reveal.volume,
    });

    const unlock = () => resync.current();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      lobby.current?.pause();
      tick.current?.pause();
      reveal.current?.pause();
    };
  }, []);

  // Drive playback from the current phase + mute state.
  useEffect(() => {
    const l = lobby.current;
    const t = tick.current;
    const r = reveal.current;
    if (!l || !t || !r) return;

    // One-shot sting the moment we enter the Reveal.
    if (phase === "reveal" && prevPhase.current !== "reveal" && !muted) {
      r.currentTime = 0;
      void r.play().catch(() => {});
    }
    prevPhase.current = phase;

    resync.current = () => {
      syncLoop(l, phase === "lobby" && !muted);
      syncLoop(t, phase === "open" && !muted);
    };
    resync.current();
  }, [phase, muted]);
}
