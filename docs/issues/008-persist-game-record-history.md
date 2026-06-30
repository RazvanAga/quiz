Issue: https://github.com/RazvanAga/quiz/issues/8

## What to build

Persist finished Games and browse them. On reaching the Podium, write one Game Record to SQLite: date, final Podium standings, each Question's Distribution, and per-Player per-Question Responses (chosen Option, time used, points). Abandoned (unfinished) Games write nothing. Add `/admin/quiz/[id]/history` listing past Games (date, number of Players, winner) and a detail view showing the Podium, Distributions, and per-Player per-Question drill-down. After persisting, the in-memory Game is evicted.

See [ADR-0002](../adr/0002-in-memory-game-state.md).

## Acceptance criteria

- [ ] A Game Record is written to SQLite on Game finish with Podium + Distributions + per-Player-per-Question detail
- [ ] Abandoned (unfinished) Games persist nothing
- [ ] Repository tests for the Game Record write/read round-trip
- [ ] History list per Quiz: date, # Players, winner
- [ ] Game Record detail view: Podium, per-Question Distribution, per-Player per-Question drill-down
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #7