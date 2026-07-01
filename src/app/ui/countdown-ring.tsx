"use client";

import { motion, useReducedMotion } from "motion/react";

// The answer countdown, shared by the Host screen (big) and the Player phone
// (small): a lime ring draining with the clock, the seconds in the middle. Under
// ~5s it flips hot and pulses — the visual half of the ticking-tension audio.
export function CountdownRing({
  remaining,
  total,
  size = 72,
  stroke = 6,
}: {
  remaining: number;
  total: number;
  size?: number;
  stroke?: number;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const low = remaining <= 5;
  const color = low ? "var(--color-wrong)" : "var(--color-lime)";

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      animate={low && !reduce ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={low && !reduce ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink-800)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          animate={{ strokeDashoffset: circ * (1 - frac) }}
          transition={{ duration: reduce ? 0 : 0.25, ease: "linear" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums"
        style={{ color, fontSize: size * 0.4 }}
      >
        {remaining}
      </span>
    </motion.div>
  );
}
