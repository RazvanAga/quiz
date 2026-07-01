"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/game/socket-client";

// "Start game" (PRD story 17): the Admin turns a Quiz into a live Game. Creation
// goes over Socket.IO, not a Server Action, because the live Game lives in the
// custom server's in-memory store (ADR-0002) — a Server Action's separate module
// scope can neither hold it nor push to clients. On success we mint a per-Game
// Host token (for reconnect-and-resume in #9) and open the Host screen.
export function StartGameButton({
  quizId,
  className,
  children = "Start game",
}: {
  quizId: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  function start() {
    setStarting(true);
    const hostToken = crypto.randomUUID();
    getSocket().emit(
      "host:createGame",
      { quizId, hostToken },
      (res: { ok: true; pin: string } | { ok: false; error: string }) => {
        if (!res.ok) {
          setStarting(false);
          window.alert(res.error);
          return;
        }
        localStorage.setItem(`quiz:hostToken:${res.pin}`, hostToken);
        // Carry the Quiz id so the Host page can load its Questions to play.
        router.push(`/admin/host/${res.pin}?quizId=${quizId}`);
      },
    );
  }

  return (
    <button type="button" onClick={start} disabled={starting} className={className}>
      {starting ? "Starting…" : children}
    </button>
  );
}
