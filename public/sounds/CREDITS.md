# Host screen sounds — license & attribution

These audio cues play only on the **Host** shared screen (see the "Host-screen
sound" feature): a lobby bed while Players join, a ticking-tension loop during
the answer countdown, and a sting on the Reveal. Player phones stay silent.

| File | Role | Playback |
|---|---|---|
| `lobby.wav` | Warm arpeggio bed | loops during the Lobby |
| `tick.wav` | Ticking / tension | loops during the answer countdown |
| `reveal.wav` | Major-chord sting | one-shot on the Reveal |

## License: CC0 1.0 (public domain)

All three files are **original works** created for this project by synthesizing
plain PCM tones — no third-party samples or recordings are used. They are
dedicated to the public domain under the
[Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
dedication: you may copy, modify, distribute, and use them, even commercially,
without asking permission or giving credit.

## Provenance / how to regenerate

They are produced deterministically by [`scripts/generate-sounds.mjs`](../../scripts/generate-sounds.mjs):

```bash
node scripts/generate-sounds.mjs
```

Because they are generated from that script (16-bit mono WAV), the provenance is
fully auditable — there is no external asset to attribute.
