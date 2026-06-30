"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

// Client island: opens a Socket.IO connection to the same origin and round-trips
// a ping/pong event to prove the realtime transport end-to-end.
export function SocketPing() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">(
    "connecting",
  );
  const [lastPong, setLastPong] = useState<number | null>(null);

  useEffect(() => {
    const socket: Socket = io();

    socket.on("connect", () => {
      setStatus("connected");
      socket.emit("ping");
    });
    socket.on("pong", (payload: { at: number }) => setLastPong(payload.at));
    socket.on("disconnect", () => setStatus("disconnected"));

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Socket.IO
      </h2>
      <p className="mt-2 text-slate-200">
        Connection: <span className="font-mono font-semibold">{status}</span>
      </p>
      <p className="text-slate-200">
        Last pong:{" "}
        <span className="font-mono font-semibold">
          {lastPong ? new Date(lastPong).toLocaleTimeString() : "—"}
        </span>
      </p>
    </div>
  );
}
