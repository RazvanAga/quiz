Issue: https://github.com/RazvanAga/quiz/issues/5

## What to build

The realtime tracer: start a Game and have Players join its Lobby. Implement the pure, transport-free Game engine with the `createGame` and `playerJoin` commands (injected `now()` clock), plus the Socket.IO adapter and an in-memory Map of active Games keyed by Game PIN. The Admin clicks Start on a Quiz → a Game is created and a unique 4-digit Game PIN is shown on the Host screen → the Player site (`/`) lets someone set a display name, pick an Avatar from a fixed preset set, and enter the PIN → they appear in the Host's Lobby in real time. Enforce unique names per Game, reject wrong/expired PINs with a clear message, and generate PINs with collision-retry against active Games.

See [ADR-0002](../adr/0002-in-memory-game-state.md).

## Acceptance criteria

- [ ] Pure Game engine handles `createGame` and `playerJoin`, returning next state + events, with an injected `now()` clock
- [ ] Engine unit tests cover join, unique-name rejection, and PIN collision-retry
- [ ] Admin Start creates a Game and displays a unique 4-digit Game PIN on the Host screen
- [ ] Player flow: set name + pick a preset Avatar + enter PIN
- [ ] Joined Players appear in the Host Lobby live (name + Avatar)
- [ ] Wrong/expired PIN and duplicate name are rejected with clear messages
- [ ] Concurrent Games supported (Map keyed by PIN)
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #3