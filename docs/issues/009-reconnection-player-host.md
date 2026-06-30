Issue: https://github.com/RazvanAga/quiz/issues/9

## What to build

Make Games survive connection blips. Players are keyed by a client-generated `playerId` stored in `localStorage` (not the socket id); on reconnect the client re-sends `playerId` + PIN and the engine re-attaches the new socket to the existing Player, preserving score and rank. The Host gets an equivalent host token to reconnect and resume control of the in-progress Game. Disconnected Players are shown as disconnected (not removed) on the Host screen. An idle-timeout GC reclaims abandoned in-memory Games and frees their PINs. Engine commands: `playerReconnect`, `hostReconnect`.

## Acceptance criteria

- [ ] Player reconnect via `localStorage` `playerId` preserves score/rank
- [ ] Host reconnect via host token resumes control of the in-progress Game
- [ ] Disconnected Players are shown as disconnected, not removed
- [ ] Idle-timeout GC evicts abandoned Games and frees their PINs
- [ ] Engine tests cover reconnect preserving state and idle GC
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #6