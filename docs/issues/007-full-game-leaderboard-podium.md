Issue: https://github.com/RazvanAga/quiz/issues/7

## What to build

Turn a single Question into a full Game. After each Reveal show an interim Leaderboard; the Host clicks Next to advance through all Questions; after the last Question show the final Podium (top-3 celebration + full ranking) on the Host screen and each Player's final placement on their phone. Engine command: `advance` / `finish`. State stays in memory; demoable as a complete multi-Question Game.

## Acceptance criteria

- [ ] An interim Leaderboard is shown between Questions
- [ ] Host Next advances Questions; after the last, the Game reaches the Podium
- [ ] Podium shows top-3 + full ranking on the Host; each Player sees their final placement
- [ ] Engine tests cover lobby → playing → podium transitions across multiple Questions
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #6