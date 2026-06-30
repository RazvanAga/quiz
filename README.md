<div align="center">

# Quiz

**A self-hosted, Kahoot-style live trivia app — author your own quizzes and play them with friends on the big screen.**

Players join from their phones, the host drives a shared screen, and everyone races to answer fastest.

![Next.js](https://img.shields.io/badge/Next.js-App_Router-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?logo=socket.io&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

> **Status: in active development.** The design is locked (see [docs/](docs/)); features are being built slice-by-slice in the [open issues](../../issues).

</div>

---

## What it is

A small, no-accounts, open-source quiz game you run on your own server. One person (the **Admin**) authors quizzes and hosts live games; everyone else joins from their phone with a 4-digit code and competes on a shared screen. Built for occasional in-person game nights with friends — not a SaaS, not monetized.

## Features

- **Live multiplayer** — players join from any phone, real-time over WebSockets
- **Shared host screen** — the question, timer, live answer count, reveal, and leaderboard on a TV/projector
- **Quiz editor** — author questions with single-choice (4 options) or true/false answers, optional images, per-question time limits and points, drag-to-reorder
- **4-digit join codes** — players enter a Game PIN to join the lobby; multiple games can run at once
- **Speed scoring** — faster correct answers score more (Kahoot-style 50–100% time bonus)
- **Leaderboard and podium** — interim standings between questions, a top-3 finale at the end
- **History and stats** — every finished game is saved per quiz, with per-player, per-question detail
- **Resilient** — players and the host reconnect after a dropped connection without losing progress
- **Host-screen sound** — lobby music, countdown tension, and reveal stings (with mute)

## How a game works

```
Admin authors a Quiz  ->  clicks Start  ->  gets a 4-digit Game PIN
                                              |
        Players open the site, pick a name + avatar, enter the PIN
                                              |
                    Lobby fills  ->  Host starts the game
                                              |
   For each Question:  intro beat -> answer (timer) -> reveal + distribution -> leaderboard
                                              |
                       Final Podium  ->  saved to the Quiz's History
```

- **Players** go to the site root (`/`), set a name + avatar, and enter the PIN.
- **Admins** work at `/admin` (protected by an nginx Basic Auth gate) to author quizzes, start games, and browse history.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js** (App Router, TypeScript) |
| Realtime | **Socket.IO**, attached to a custom Node server |
| Storage | **SQLite** via `better-sqlite3` (WAL mode), single file |
| Styling | **Tailwind CSS**, mobile-first |
| Deploy | One Node process behind **nginx** on a VPS |

Live game state lives in memory; the database is written only when a quiz is edited or a game finishes. The whole thing runs as a **single Node process** — no serverless, no external realtime service, no separate database server. See the [ADRs](docs/adr/) for the reasoning.

## Project structure

```
.
├── docs/
│   ├── README.md       Docs index
│   ├── CONTEXT.md      Glossary / ubiquitous language
│   ├── PRD-01.md       Product spec
│   ├── adr/            Architecture Decision Records
│   └── issues/         Implementation slices (mirror of the GitHub issues)
└── ...                 App code (added with issue #2, the walking skeleton)
```

## Development

> The app scaffold is the first build slice ([#2 — Walking skeleton](../../issues/2)). Once it lands:

```bash
npm install
npm run dev      # Next.js + Socket.IO on one port
```

Data (the SQLite file and uploaded images) lives under `data/` and is gitignored — back it up by copying that folder.

## Deployment

Designed to run as a single Node process behind nginx on a VPS, with HTTP Basic Auth gating `/admin`. Full deploy steps (process supervision, nginx reverse-proxy with WebSocket upgrade, the `/admin` auth gate, backups) are tracked in [#13](../../issues/13).

## Documentation

- **[Glossary](docs/CONTEXT.md)** — the project's vocabulary (Quiz, Game, Game PIN, Host, Player, Reveal, Podium, …)
- **[PRD-01](docs/PRD-01.md)** — the full product spec and user stories
- **[ADRs](docs/adr/)** — why the key architectural choices were made
- **[Issues](../../issues)** — the build plan as vertical slices

## License

[MIT](LICENSE) — free to use, for my own game nights and yours.
