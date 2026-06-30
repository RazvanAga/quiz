Issue: https://github.com/RazvanAga/quiz/issues/13

## What to build

Make the app deployable on the Hetzner VPS and document it. Write README deploy steps: building/running the single Node process under a supervisor (pm2 or systemd), an nginx reverse-proxy config for `quiz.domeniu.com` that proxies HTTP + the WebSocket upgrade and puts HTTP Basic Auth on the `/admin` location (htpasswd), and backup guidance (copy the data folder). This slice is HITL: applying it requires the operator's VPS, domain, and the htpasswd secret.

See [ADR-0004](../adr/0004-nginx-basic-auth-admin.md).

## Acceptance criteria

- [ ] README documents one-process build/run under pm2 or systemd
- [ ] nginx config example proxies HTTP + the WebSocket upgrade for `quiz.domeniu.com`
- [ ] nginx Basic Auth gate on `/admin` documented (htpasswd); Player flow left open
- [ ] Backup guidance: copy the data folder (SQLite + uploads)
- [ ] Note that better-sqlite3 needs build tools on the VPS
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #8