# PRD-01: Kahoot-style live quiz app

> Vocabulary follows [docs/CONTEXT.md](CONTEXT.md). Architecture constraints live in [docs/adr/](adr/).

## Problem Statement

I want to run live trivia games with friends at meetups, where everyone plays on their phones against a shared big screen. Existing tools (Kahoot etc.) are SaaS with accounts, limits, and branding I don't control. I want my own app on my own domain (`quiz.domeniu.com`) where I can author my own Quizzes, host Games occasionally in person, and keep a History of how each Game went — fully self-hosted, open-source, for my own use, no monetization.

## Solution

A self-hosted web app with two faces:

- **Players** go to `quiz.domeniu.com`, set a display name, pick an Avatar, enter a 4-digit **Game PIN**, and play along on their phones.
- The **Admin** goes to `quiz.domeniu.com/admin` (protected by an nginx Basic Auth gate) to author Quizzes, start a Game, and review History. On starting a Game, the Admin becomes the **Host** and drives the shared screen (laptop → TV/projector): showing each Question, the live answer count, the Reveal, the interim Leaderboard, and the final Podium.

A Game flows: **Lobby** (Players join via PIN) → Host starts → for each Question: short intro beat → answering with a countdown → Reveal (correct Option + Distribution) → Leaderboard → Host clicks Next → after the last Question, the **Podium**. The finished Game is saved as a **Game Record** in that Quiz's History, with per-Player, per-Question detail.

## User Stories

### Authoring (Admin)

1. As an Admin, I want to open `/admin` and see a library of all my Quizzes (title, number of Questions, when each was last played), so that I can find and manage them at a glance.
2. As an Admin, I want to create a new Quiz with a title, so that I can start building a set of Questions.
3. As an Admin, I want to add a Question to a Quiz, so that I can build up the content.
4. As an Admin, I want to choose a Question's type (single-choice or True/False), so that I can vary the format.
5. As an Admin, I want to write the Question text in any language, so that I'm not constrained by the English UI.
6. As an Admin, I want to optionally attach an image to a Question, so that I can ask visual questions ("who is this?").
7. As an Admin, I want to author a single-choice Question with 4 Options and mark exactly one correct, so that scoring is unambiguous.
8. As an Admin, I want a True/False Question to present exactly two fixed Options with one marked correct, so that it's fast to author.
9. As an Admin, I want to set a per-Question time limit from preset values (10/20/30/60s), so that I can pace harder/easier Questions differently.
10. As an Admin, I want to set a per-Question point value from preset values (500/1000/2000), so that I can weight Questions.
11. As an Admin, I want a new Question to default to single-choice, 20s, 1000 points, so that I can author quickly without configuring every field.
12. As an Admin, I want to reorder Questions by dragging, so that I control the Quiz's flow.
13. As an Admin, I want to edit an existing Question, so that I can fix mistakes.
14. As an Admin, I want to delete a Question (with a confirmation), so that I can remove ones I no longer want.
15. As an Admin, I want to delete an entire Quiz (with a confirmation), so that I can clean up.
16. As an Admin, I want my Quiz edits to persist, so that they survive server restarts and are there next time.

### Starting a Game (Admin → Host)

17. As an Admin, I want to click "Start game" on a Quiz, so that a live Game is created from it.
18. As a Host, I want a unique 4-digit Game PIN displayed prominently when a Game starts, so that Players can join.
19. As a Host, I want to run multiple Games concurrently if needed, so that one stale Game never blocks me from starting another.
20. As a Host, I want the shared screen to show the Lobby with Players appearing (name + Avatar) as they join, so that everyone sees who's in.
21. As a Host, I want to decide when to start the Questions (a Start control in the Lobby), so that I can wait for stragglers and build anticipation.

### Joining (Player)

22. As a Player, I want to open `quiz.domeniu.com` and set a display name, so that I'm identified on the Leaderboard.
23. As a Player, I want to pick an Avatar from a fixed preset set, so that I have a visual identity without uploading anything.
24. As a Player, I want to enter a 4-digit Game PIN, so that I join the right Game.
25. As a Player, I want to be rejected with a clear message if I enter a wrong/expired PIN, so that I know to recheck it.
26. As a Player, I want to be rejected if my chosen name is already taken in that Game, so that the Leaderboard isn't ambiguous.
27. As a Player, I want to be told if the Game has already started, so that I understand why I can't join (no late joins).
28. As a Player, I want to wait in the Lobby after joining, so that I know I'm in and the Game hasn't started yet.

### Playing a Question

29. As a Player, I want each Question to first show its text (and image) for a few seconds before the Options become tappable, so that I have time to read before the race starts.
30. As a Player, I want to see the full Question text and Options on my own phone, so that I can play even if I can't read the shared screen.
31. As a Player, I want to tap an Option to submit my Response, so that I answer.
32. As a Player, I want my Response to lock instantly on tap (no submit step), so that my speed counts.
33. As a Player, I want to see a countdown timer, so that I feel the time pressure.
34. As a Host, I want the shared screen to show a live count of how many Players have answered (not who or what), so that I can sense progress without spoiling answers.
35. As a Player, I want the Question to close shortly after everyone has answered (a 2-second grace), so that we don't wait out the full timer needlessly.
36. As a Player, I want the Question to close when the timer reaches zero even if I didn't answer, so that the Game keeps moving.
37. As a Player, I want faster correct Responses to earn more points (50–100% of the Question's points scaled by speed), so that quick thinking is rewarded.
38. As a Player, I want a wrong or missing Response to earn zero points, so that scoring is fair.

### Reveal & standings

39. As a Host, I want the shared screen to reveal the correct Option after each Question, so that everyone learns the answer.
40. As a Host, I want the shared screen to show the Distribution (how many chose each Option), so that we can see how the room split.
41. As a Player, I want my phone to show whether I was right or wrong and how many points I gained, so that I get immediate feedback.
42. As a Host, I want an interim Leaderboard between Questions, so that the competition stays exciting.
43. As a Host, I want to click "Next" to advance to the next Question, so that I control the pacing and banter.
44. As a Host, I want a final Podium at the end celebrating the top finishers and showing full standings, so that the Game has a climax.
45. As a Player, I want to see my final placement on the Podium, so that I know how I did.

### Resilience

46. As a Player, I want to reconnect after my phone locks or my connection blips and keep my score and place, so that a glitch doesn't ruin my Game.
47. As a Host, I want to refresh or recover the shared screen and resume control of the in-progress Game, so that a host-side glitch doesn't end everyone's Game.
48. As a Host, I want disconnected Players shown as disconnected rather than removed, so that I know who dropped while the Game continues.
49. As an Admin, I want abandoned Games (never finished) to leave no trace, so that History only contains real, completed Games.

### History

50. As an Admin, I want each Quiz to have a History of past Games, so that I can look back on previous sessions.
51. As an Admin, I want the History list to show each Game's date, number of Players, and winner, so that I can scan past Games.
52. As an Admin, I want to open one Game Record and see its final Podium standings, so that I remember who won.
53. As an Admin, I want a Game Record to show per-Question Distributions, so that I can see which Questions were hard.
54. As an Admin, I want per-Player, per-Question detail in a Game Record (which Option each Player picked, time taken, points), so that I can drill into how the Game played out.

### Hosting / deployment

55. As the operator, I want the whole app to run as a single Node process on my Hetzner VPS, so that deployment and supervision are simple.
56. As the operator, I want `/admin` protected by nginx Basic Auth, so that random visitors and crawlers can't reach authoring on my public domain.
57. As the operator, I want the database and uploaded images to be plain files I can back up by copying, so that backups are trivial.
58. As the operator, I want the project open-source under a permissive license with deploy instructions, so that I (and others) can run it.

## Implementation Decisions

### Architecture (see ADRs)

- **Single Node process**: Next.js (App Router, TypeScript) booted by a custom `server.js` that also attaches Socket.IO to the same HTTP server. Deployed behind nginx on a Hetzner VPS. Not serverless/Vercel ([ADR-0001](adr/0001-nextjs-custom-server-socketio.md)).
- **Live Game state in memory**, keyed by Game PIN in a Map; persistence only on Quiz save/edit and on Game finish ([ADR-0002](adr/0002-in-memory-game-state.md)).
- **SQLite via better-sqlite3 in WAL mode**, single file in `data/` ([ADR-0003](adr/0003-sqlite-over-postgres.md)).
- **No app auth**; nginx Basic Auth gates `/admin` ([ADR-0004](adr/0004-nginx-basic-auth-admin.md)).
- **Tailwind CSS**, mobile-first, bold game aesthetic. English code + UI; Quiz content authored in any language.

### Modules

- **Game engine** (pure, transport-free): owns Game state and the lifecycle state machine. Accepts domain commands (`createGame`, `playerJoin`, `startGame`, `submitResponse`, `closeQuestion`, `advance`, `finish`, `playerReconnect`, `hostReconnect`) and returns the next state plus a list of events to emit. Takes an injected `now()` clock so scoring and timing windows are deterministic. Knows nothing about sockets or SQLite.
- **Socket.IO adapter**: thin layer translating socket messages → engine commands and engine events → socket emits. Manages timers (question countdown, the 2s all-answered grace, the intro beat, idle-GC) by calling engine commands; holds the Map of active Games.
- **Repository**: wraps SQLite for Quiz CRUD and Game Record read/write. Synchronous (better-sqlite3). Sets `journal_mode = WAL` at startup.
- **Image upload**: a Next.js route handler saves uploaded Question images to disk under the data/uploads area, served statically; the Question stores the resulting URL.
- **Admin UI** (Next pages): `/admin` library, `/admin/quiz/[id]` editor, `/admin/quiz/[id]/history`, `/admin/host/[pin]` live Host screen.
- **Player UI** (Next pages): `quiz.domeniu.com` name+Avatar+PIN entry → Lobby → per-Question play → personal Reveal → Podium.

### State machine

A Game progresses: `lobby` → (`question_intro` → `question_open` → `question_closed`/Reveal → `leaderboard`) repeated per Question → `podium` → finished (persisted, then evicted from memory). A Question closes on timer-zero **or** all connected Players answered + a 2s grace, whichever first.

### Scoring

For a correct Response: `score = round(points * (1 - (timeUsed / timeLimit) / 2))` — full points at instant, half at the buzzer. Wrong/missing = 0. No streak bonus. `timeUsed` is measured from when Options become tappable to the tap.

### Identity & reconnection

- Player keyed by a client-generated `playerId` (UUID in `localStorage`), not the socket id. On reconnect, the client re-sends `playerId` + Game PIN; the engine re-attaches the new socket to the existing Player, preserving score/rank.
- Host gets an equivalent host token for reconnect-and-resume.
- Names unique per Game. No join after Start. Disconnected Players remain in the Game, flagged disconnected.

### Game PIN lifecycle

4-digit (0000–9999), generated at Start with collision-retry against active Games, freed on finish, reusable later. An idle-timeout GC reclaims abandoned in-memory Games and frees their PINs.

### Data model (schema intent, not code)

- **Quiz**: id, title, ordered Questions, timestamps.
- **Question**: id, type (`single` | `truefalse`), text, optional imageUrl, Options, correctOptionId, timeLimitSec, points.
- **Option**: id, text.
- **Game Record** (persisted on finish): id, quizId, finishedAt, final Podium standings, per-Question Distribution, and per-Player per-Question Responses (chosen Option, timeUsed, points).

### Question types

Single-choice (4 Options, 1 correct) and True/False (2 Options, 1 correct). Both lock instantly on tap. Multi-select was considered and cut.

## Testing Decisions

Good tests here assert **external behavior** — given a sequence of domain commands and a controlled clock, what state and emitted events result — not internal structure. Seams confirmed with the developer:

- **Game engine (primary seam, Seam 1)**: tested directly by feeding command sequences (`createGame`, `playerJoin`, `startGame`, `submitResponse`, `closeQuestion`, `advance`, `finish`, reconnect commands) and asserting resulting state + emitted events. With the **injected clock**, these cover: time-scaled scoring (full/half/zero), close-on-all-answered + 2s grace vs close-on-timeout, lobby→playing→podium transitions, unique-name enforcement, no-late-join, reconnection preserving score, and PIN collision-retry. No WebSocket, no real timers.
- **Repository (Seam 2)**: tested against a temp-file or `:memory:` SQLite — Quiz CRUD round-trips and Game Record write/read, including per-Player-per-Question detail and Distribution. Real SQL, throwaway DB.
- **Socket.IO smoke (Seam 3, minimal)**: a few integration tests connecting a real Socket.IO client to a test server for one happy-path Game, to catch wiring/serialization mistakes the engine tests can't see. Kept small to avoid flakiness.

No prior art exists (greenfield repo); these seams establish the testing conventions. React UI screens and the nginx gate are verified manually, not automated.

## Out of Scope

- App-level authentication / OAuth / accounts (protection is the nginx Basic Auth gate only).
- Multi-select Questions, type-the-answer, ordering, sliders, or any Question type beyond single-choice and True/False.
- Streak bonuses and any scoring beyond the time-scaled formula.
- Late joining after a Game has started.
- Surviving a server restart mid-Game (in-progress Games are lost by design).
- Player image uploads (Avatars are presets); only Question images are uploadable.
- i18n / UI translation (English UI; content is language-agnostic).
- Automated UI tests; durable/Redis-backed game state; Postgres; hosted realtime services; Vercel/serverless deployment.
- Monetization, public Quiz sharing, or any multi-tenant/account features.

## Further Notes

- Sound/music plays on the **Host screen only** (mute toggle), using CC0-licensed assets documented in the repo; Player phones stay silent to avoid 30 offset audio streams.
- Open-source under MIT (to confirm at scaffold time) with README deploy steps (nginx config incl. the `/admin` Basic Auth, process supervision via pm2/systemd, backup = copy the data folder).
- `data/` (SQLite file + uploads) must be gitignored.
- better-sqlite3 is a native module — the VPS needs build tools at install time.
