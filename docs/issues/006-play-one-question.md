Issue: https://github.com/RazvanAga/quiz/issues/6

## What to build

Play a single Question end-to-end from the Lobby. The Host starts the Questions; each Question shows an intro beat (text + image area) for a few seconds before Options become tappable; a countdown runs; a Player taps an Option which locks instantly and records a Response; the Question closes on timer-zero OR when all connected Players have answered plus a 2-second grace; then Reveal shows the correct Option and the Distribution on the Host screen and right/wrong + points gained on each Player's phone. Scoring is time-scaled 50–100% of the Question's points for a correct Response, 0 otherwise. No joins are allowed after Start. Engine commands: `startGame`, `submitResponse`, `closeQuestion`; the socket adapter owns the timers.

Scoring (from the PRD): `score = round(points * (1 - (timeUsed / timeLimit) / 2))` for correct; 0 for wrong/missing. `timeUsed` is measured from when Options become tappable.

## Acceptance criteria

- [ ] Engine handles `startGame` / `submitResponse` / `closeQuestion` with the injected clock; tests cover time-scaled scoring (full/half/zero), close-on-all-answered+2s grace vs close-on-timeout, and no-late-join
- [ ] Host screen: intro beat → Options + countdown + live answered-count → Reveal with correct Option + Distribution
- [ ] Player screen: full Question + Options, tap locks instantly, then right/wrong + points gained
- [ ] Joining after Start is rejected with a clear message
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #5