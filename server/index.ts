import express from "express";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";

// Absorb DB connection drops (Neon idle-suspend, ECONNRESET, socket
// hang up) before they can crash the process via unhandled rejection or
// uncaught exception. The pool handler in db.ts covers the pool-level
// events; these catch anything that escapes from async worker callbacks.
const TRANSIENT_DB_MSGS = [
  "terminating connection",
  "Connection terminated",
  "socket hang up",
  "ECONNRESET",
  "57P01",
];
function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_DB_MSGS.some((s) => msg.includes(s));
}

process.on("unhandledRejection", (reason) => {
  if (isTransientDbError(reason)) {
    console.warn("[Server] Absorbed transient DB rejection — process stays up:", (reason as Error).message ?? reason);
  } else {
    console.error("[Server] Unhandled rejection:", reason);
  }
});

process.on("uncaughtException", (err) => {
  if (isTransientDbError(err)) {
    console.warn("[Server] Absorbed transient DB exception — process stays up:", err.message);
  } else {
    console.error("[Server] Uncaught exception:", err);
    process.exit(1);
  }
});

const app = express();
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => {
    if (req.originalUrl === "/api/social/webhook" || req.url === "/api/social/webhook") {
      req.rawBody = buf;
    }
    // Phase NC-01 — billing webhook signature verification needs the
    // unmodified request body. Capture it before JSON parsing for any
    // /api/billing/webhook/* path.
    if (req.originalUrl?.startsWith("/api/billing/webhook") || req.url?.startsWith("/api/billing/webhook")) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: false }));

setupAuth(app);

(async () => {
  await registerRoutes(app);

  const httpServer = createServer(app);

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);
  }

  const port = 5000;
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
})();
