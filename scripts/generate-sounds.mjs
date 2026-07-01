// Synthesizes the Host screen's audio cues as original works, dedicated to the
// public domain (CC0) — see public/sounds/CREDITS.md. Run with:
//
//   node scripts/generate-sounds.mjs
//
// It writes three seamless-looping / one-shot WAVs into public/sounds:
//   lobby.wav   a warm arpeggio bed that loops while Players join
//   tick.wav    a 1s ticking-tension loop for the answer countdown
//   reveal.wav  a short major-chord sting for the Reveal
//
// Pure Node, no dependencies: everything is written as 16-bit mono PCM WAV.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");
mkdirSync(OUT, { recursive: true });

// --- helpers ---------------------------------------------------------------

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const clamp = (x) => Math.max(-1, Math.min(1, x));

// Add a note (sum of sine partials) with an ADSR-ish envelope into `buf`.
function addNote(buf, { start, dur, freq, gain = 0.2, partials = [1], attack = 0.01, release = 0.15 }) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  const rel = Math.floor(release * SR);
  const atk = Math.max(1, Math.floor(attack * SR));
  const norm = partials.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n + rel; i++) {
    const idx = s0 + i;
    if (idx >= buf.length) break;
    let env;
    if (i < atk) env = i / atk;
    else if (i < n) env = 1 - 0.3 * ((i - atk) / Math.max(1, n - atk)); // gentle decay while held
    else env = 0.7 * (1 - (i - n) / rel); // release tail
    const t = i / SR;
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      s += partials[p] * Math.sin(2 * Math.PI * freq * (p + 1) * t);
    }
    buf[idx] += (s / norm) * gain * Math.max(0, env);
  }
}

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
  }
  const path = join(OUT, name);
  writeFileSync(path, buf);
  console.log(`wrote ${name} (${(buf.length / 1024).toFixed(0)} KB, ${(n / SR).toFixed(1)}s)`);
}

// --- lobby.wav: warm looping arpeggio over a soft bass ----------------------

function lobby() {
  const bpm = 96;
  const beat = 60 / bpm;
  const step = beat / 2; // eighth notes
  const bars = 8; // two chords per bar → 4-chord progression, twice
  const dur = bars * 4 * beat;
  const buf = new Float32Array(Math.ceil(dur * SR));

  // I–vi–IV–V in C: chords as MIDI roots, over two bars each pass.
  const prog = [
    [60, 64, 67, 72], // C
    [57, 60, 64, 69], // Am
    [53, 57, 60, 65], // F
    [55, 59, 62, 67], // G
  ];
  const soft = [1, 0.35, 0.12];

  let t = 0;
  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[Math.floor(bar / 2) % prog.length];
    const root = chord[0] - 12;
    // Bass note per bar.
    addNote(buf, { start: t, dur: 2 * beat, freq: midi(root), gain: 0.16, partials: [1, 0.5, 0.2], attack: 0.02, release: 0.4 });
    // Arpeggio: 8 eighth-notes climbing/falling through the chord.
    const pattern = [0, 1, 2, 3, 2, 3, 1, 2];
    for (let s = 0; s < 8; s++) {
      const note = chord[pattern[s] % chord.length] + (s >= 4 ? 12 : 0);
      addNote(buf, {
        start: t + s * step,
        dur: step * 0.9,
        freq: midi(note),
        gain: 0.13,
        partials: soft,
        attack: 0.008,
        release: 0.18,
      });
    }
    t += 2 * beat;
  }
  // Fade the very edges into each other so the loop seam is inaudible.
  const fade = Math.floor(0.03 * SR);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    buf[i] *= g;
    buf[buf.length - 1 - i] *= g;
  }
  writeWav("lobby.wav", buf);
}

// --- tick.wav: 1s ticking-tension loop --------------------------------------

function tick() {
  const dur = 1.0;
  const buf = new Float32Array(Math.ceil(dur * SR));
  // Two ticks per second (hi/lo like a clock), each a short filtered blip.
  const ticks = [
    { at: 0.0, freq: 1400, gain: 0.32 },
    { at: 0.5, freq: 1050, gain: 0.26 },
  ];
  for (const { at, freq, gain } of ticks) {
    const s0 = Math.floor(at * SR);
    const len = Math.floor(0.045 * SR);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (0.010 * SR));
      buf[s0 + i] += Math.sin(2 * Math.PI * freq * (i / SR)) * env * gain;
    }
  }
  // A low pulsing drone underneath for tension.
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t); // 2 Hz throb
    buf[i] += Math.sin(2 * Math.PI * 55 * t) * 0.05 * pulse;
  }
  writeWav("tick.wav", buf);
}

// --- reveal.wav: short major-chord sting ------------------------------------

function reveal() {
  const dur = 1.4;
  const buf = new Float32Array(Math.ceil(dur * SR));
  // Bright C-major stab with an octave on top, quick attack, ringing release.
  const notes = [60, 64, 67, 72, 76];
  notes.forEach((n, i) => {
    addNote(buf, {
      start: 0.0 + i * 0.012, // tiny strum
      dur: 0.15,
      freq: midi(n),
      gain: 0.22,
      partials: [1, 0.5, 0.25, 0.12],
      attack: 0.004,
      release: 1.0,
    });
  });
  writeWav("reveal.wav", buf);
}

lobby();
tick();
reveal();
