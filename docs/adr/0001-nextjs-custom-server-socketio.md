# Next.js with a custom server + Socket.IO, self-hosted

A live quiz Game is stateful and long-lived: the server must hold the Game in memory and keep a persistent WebSocket open to every Player for the whole Game. Serverless (Vercel) cannot do this — functions are request/response, have no shared in-memory state across invocations, time out, and can't host Socket.IO (which needs a persistent server with sticky sessions). So we run Next.js (App Router, TypeScript) with a custom `server.js` that boots Next *and* attaches Socket.IO to the same HTTP server, deployed as one Node process on a Hetzner VPS behind nginx.

## Consequences

- Cannot deploy to Vercel/serverless as-is. If that's ever wanted, only the realtime transport would need swapping (e.g. a hosted realtime service); the UI and editor are unaffected.
- One process to run and supervise (pm2/systemd) — no separate WebSocket service, no CORS split, no external realtime dependency.
