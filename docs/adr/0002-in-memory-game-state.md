# Live game state in memory; persist only finished Games

A Game's live state (joined Players, current Question, countdown, running scores, Responses) lives in memory on the Node process, keyed by Game PIN in a Map. The database is written only at two moments: when an Admin saves/edits a Quiz, and when a Game finishes (one Game Record per finished Game). Player Responses during play mutate in-memory objects, never the database — so a burst of simultaneous answers produces zero DB writes and never contends on storage.

## Consequences

- A server restart mid-Game (crash, deploy, `pm2 restart`) loses the in-progress Game; Players rejoin a fresh Game. Accepted: for occasional in-person games this just means restarting the round, and avoiding per-tick persistence keeps the design far simpler than a durable/Redis-backed alternative.
- Abandoned Games (never reaching the Podium) persist nothing — only completed Games enter History.
- An idle-timeout GC reclaims abandoned in-memory Games (and frees their PINs).
