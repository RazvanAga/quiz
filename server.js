// Custom server: boots Next.js and attaches Socket.IO to the same HTTP server,
// so the whole app runs as one Node process on a single port (see ADR-0001).
const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    // Walking-skeleton proof: round-trip a ping/pong over the WebSocket.
    socket.on("ping", () => {
      socket.emit("pong", { at: Date.now() });
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port} (Next + Socket.IO)`);
    });
});
