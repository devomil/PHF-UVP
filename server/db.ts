import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Neon serverless terminates idle connections with a "terminating
// connection due to administrator command" error (code 57P01). Without
// this handler the error event has no listener and Node.js treats it as
// an uncaught exception, crashing the process. The pool automatically
// creates a fresh connection for the next query, so we just log + swallow.
pool.on("error", (err: Error & { code?: string }) => {
  const isExpectedDisconnect =
    err.code === "57P01" || // terminating connection due to administrator command (Neon idle suspend)
    err.message?.includes("terminating connection") ||
    err.message?.includes("Connection terminated") ||
    err.message?.includes("socket hang up") ||
    err.message?.includes("ECONNRESET");

  if (isExpectedDisconnect) {
    console.warn("[DB] Pool connection dropped (Neon idle suspend) — will reconnect on next query");
  } else {
    console.error("[DB] Unexpected pool error:", err.message);
  }
});

export const db = drizzle({ client: pool, schema });
export { pool };
