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

The app runs as a **single Node process** behind **nginx** on a VPS (e.g. Hetzner). nginx terminates TLS, reverse-proxies HTTP + the WebSocket upgrade, and puts **HTTP Basic Auth on `/admin`** — the Player flow (`/`) stays open. See [ADR-0004](docs/adr/0004-nginx-basic-auth-admin.md) for why auth lives in the proxy, not the app.

The steps below assume Ubuntu/Debian, the domain `quiz.domeniu.com`, and the app checked out at `/opt/quiz` running as user `quiz`.

### 1. Prerequisites

Install Node.js (18+) and the build tools `better-sqlite3` needs — it's a **native module**, so npm compiles it on install and the VPS needs a C/C++ toolchain and Python:

```bash
# Node 20 LTS (NodeSource) + build tools for better-sqlite3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
```

> If `npm install` fails on `better-sqlite3` with a `node-gyp` / compiler error, `build-essential` and `python3` are what's missing.

### 2. Build and run the single process

```bash
git clone https://github.com/RazvanAga/quiz.git /opt/quiz
cd /opt/quiz
npm ci
npm run build            # next build
PORT=3000 npm start      # cross-env NODE_ENV=production node server.js
```

The server binds `PORT` (default `3000`, and `HOST`, default `0.0.0.0`). Next.js **and** Socket.IO are served by the same process on that one port. Data (SQLite + uploads) is written under `./data` relative to the working directory, so always start the process from the repo root.

### 3. Supervise the process (systemd)

Keep the process alive across crashes and reboots with a systemd unit. Create `/etc/systemd/system/quiz.service`:

```ini
[Unit]
Description=Quiz (Next.js + Socket.IO, single process)
After=network.target

[Service]
Type=simple
User=quiz
WorkingDirectory=/opt/quiz
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now quiz
sudo systemctl status quiz      # check it's running
journalctl -u quiz -f           # follow logs
```

To deploy an update: `git pull && npm ci && npm run build && sudo systemctl restart quiz`.

<details>
<summary>Alternative: pm2</summary>

If you prefer pm2 over systemd:

```bash
sudo npm install -g pm2
cd /opt/quiz
PORT=3000 pm2 start npm --name quiz -- start
pm2 save
pm2 startup            # prints a command to run so pm2 resurrects on boot
```

</details>

### 4. nginx reverse proxy + WebSocket upgrade + `/admin` Basic Auth

First create the htpasswd file that gates `/admin` (install `apache2-utils` for `htpasswd`):

```bash
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/quiz.htpasswd admin   # prompts for a password
```

Then the site config, `/etc/nginx/sites-available/quiz.domeniu.com`:

```nginx
server {
    server_name quiz.domeniu.com;

    # Player flow and everything else: open, proxied to the Node process.
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket upgrade for Socket.IO (/socket.io/ rides through here too).
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;   # keep long-lived game sockets open
    }

    # Admin/authoring/history surface: gated by HTTP Basic Auth.
    # The host screen (/admin/host/<pin>) is under /admin, so it's covered too.
    location /admin {
        auth_basic "Quiz Admin";
        auth_basic_user_file /etc/nginx/quiz.htpasswd;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/quiz.domeniu.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Add HTTPS with Certbot (`sudo certbot --nginx -d quiz.domeniu.com`), which rewrites the `listen` block to 443 and adds a redirect. The `/admin` gate keeps working over TLS unchanged.

> **The `/admin` protection lives entirely in this nginx config.** Running the Node process on a public port without the proxy — or dropping the `auth_basic` lines — exposes Quiz create/edit/delete and History to anyone (ADR-0004).

### 5. Backups

All state is two things under `./data`, both gitignored:

- `data/quiz.db` (plus `quiz.db-wal` / `quiz.db-shm` in WAL mode) — the SQLite database
- `data/uploads/` — uploaded Question images

Back up by **copying the whole `data/` folder**. A simple nightly cron is enough:

```bash
# copy data/ to a timestamped tarball; keep it off-box for real safety
tar czf /backups/quiz-$(date +\%F).tar.gz -C /opt/quiz data
```

Copying while the app runs is safe under WAL (SQLite keeps the main file consistent), but for a guaranteed-clean snapshot you can `sudo systemctl stop quiz`, copy, then start it again. Restore by putting the `data/` folder back before starting the process.

## Documentation

- **[Glossary](docs/CONTEXT.md)** — the project's vocabulary (Quiz, Game, Game PIN, Host, Player, Reveal, Podium, …)
- **[PRD-01](docs/PRD-01.md)** — the full product spec and user stories
- **[ADRs](docs/adr/)** — why the key architectural choices were made
- **[Issues](../../issues)** — the build plan as vertical slices

## License

[MIT](LICENSE) — free to use, for my own game nights and yours.
