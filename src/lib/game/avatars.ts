// The fixed preset set of Avatars a Player picks from when joining (no uploads,
// per docs/CONTEXT.md). The stable `id` is what travels over the wire and is
// stored alongside the Player; the `glyph` is just how the UI draws it, so the
// set can be restyled later without touching stored Game data.

export interface Avatar {
  id: string;
  glyph: string;
  label: string;
}

export const AVATARS: readonly Avatar[] = [
  { id: "fox", glyph: "🦊", label: "Fox" },
  { id: "owl", glyph: "🦉", label: "Owl" },
  { id: "cat", glyph: "🐱", label: "Cat" },
  { id: "panda", glyph: "🐼", label: "Panda" },
  { id: "frog", glyph: "🐸", label: "Frog" },
  { id: "penguin", glyph: "🐧", label: "Penguin" },
  { id: "unicorn", glyph: "🦄", label: "Unicorn" },
  { id: "octopus", glyph: "🐙", label: "Octopus" },
  { id: "bee", glyph: "🐝", label: "Bee" },
  { id: "dragon", glyph: "🐉", label: "Dragon" },
  { id: "robot", glyph: "🤖", label: "Robot" },
  { id: "alien", glyph: "👽", label: "Alien" },
] as const;

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export function isAvatarId(id: string): boolean {
  return BY_ID.has(id);
}

// Glyph for a known Avatar id, or a neutral fallback for an unknown one so the
// UI never renders blank if the preset set changes between sessions.
export function avatarGlyph(id: string): string {
  return BY_ID.get(id)?.glyph ?? "❓";
}
