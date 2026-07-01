import { AnswerShape } from "@/lib/game/answer-style";

// The wordmark: the four arcade shapes + "QUIZ" in the display voice. Server-safe
// (no hooks), so every surface can head with it.
export function Wordmark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const shape = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const text = size === "sm" ? "text-base" : "text-xl";
  const colors = ["text-ans-red", "text-ans-blue", "text-ans-gold", "text-ans-green"];
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1">
        {colors.map((c, i) => (
          <AnswerShape key={i} index={i} className={`${shape} ${c}`} />
        ))}
      </span>
      <span className={`font-display font-extrabold tracking-tight text-ink-100 ${text}`}>
        QUIZ
      </span>
    </span>
  );
}
