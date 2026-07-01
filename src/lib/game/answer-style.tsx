// The four answer colors, shared by the Host screen, the Player phone, and the
// History detail so a Player can shout "the blue triangle" across the room and
// everyone is looking at the same thing. Each position also carries a distinct
// SHAPE — the color-blind and the far-from-the-TV read shape, not just hue.

export type AnswerShapeKind = "triangle" | "diamond" | "circle" | "square";

export interface AnswerStyle {
  /** Background utility for the tile face. */
  face: string;
  /** CSS color for the chunky bottom edge (feed to the `--tile-edge` var). */
  edge: string;
  /** Ring utility used when this option is the correct one on the Reveal. */
  ring: string;
  shape: AnswerShapeKind;
}

export const ANSWER_STYLES: readonly AnswerStyle[] = [
  { face: "bg-ans-red", edge: "var(--color-ans-red-deep)", ring: "ring-ans-red", shape: "triangle" },
  { face: "bg-ans-blue", edge: "var(--color-ans-blue-deep)", ring: "ring-ans-blue", shape: "diamond" },
  { face: "bg-ans-gold", edge: "var(--color-ans-gold-deep)", ring: "ring-ans-gold", shape: "circle" },
  { face: "bg-ans-green", edge: "var(--color-ans-green-deep)", ring: "ring-ans-green", shape: "square" },
] as const;

export function answerStyle(index: number): AnswerStyle {
  return ANSWER_STYLES[index % ANSWER_STYLES.length];
}

const PATHS: Record<AnswerShapeKind, React.ReactNode> = {
  triangle: <polygon points="12,4 21,20 3,20" />,
  diamond: <polygon points="12,3 21,12 12,21 3,12" />,
  circle: <circle cx="12" cy="12" r="9" />,
  square: <rect x="4" y="4" width="16" height="16" rx="3" />,
};

/** The position's shape glyph, in currentColor. Plain SVG — safe on server and
 *  client. Sized by the caller with width/height utilities. */
export function AnswerShape({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      {PATHS[answerStyle(index).shape]}
    </svg>
  );
}
