// Task #196 — Persistent, restart-safe sliding-window rate limiter.
//
// The previous deck-analyze limiter lived in an in-memory Map, so it reset on
// every restart/redeploy and was not shared across instances (the abuse cap
// could be bypassed right after a deploy or at horizontal scale). This helper
// backs the limiter with the `rate_limit_hits` table instead, so the window is
// enforced consistently across restarts and instances.
//
// Concurrency safety: a naive count-then-insert is NOT race-free under Postgres
// MVCC — parallel requests can all read the same pre-insert snapshot and every
// one of them inserts, overshooting the cap exactly in the burst/abuse case the
// limit exists to stop. To prevent that we serialize all checks for a given
// (bucket, subject) with a transaction-scoped advisory lock
// (pg_advisory_xact_lock), so concurrent requests for the same subject are
// processed one at a time and the count each one sees is authoritative. The
// lock is released automatically when the transaction commits.

import { sql } from "drizzle-orm";
import { db } from "../db";

export interface RateLimitOptions {
  /** Logical namespace for the limit, e.g. "deck-analyze". */
  bucket: string;
  /** The thing being limited, e.g. a userId or IP. */
  subject: string;
  /** Max allowed hits within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

/**
 * Record a hit and report whether the subject is now rate-limited.
 *
 * Returns `true` when the request should be throttled (limit already reached —
 * no hit is recorded in that case), `false` when it is allowed (a hit row is
 * inserted). Checks for the same `(bucket, subject)` are serialized via a
 * transaction-scoped advisory lock so concurrent bursts cannot overshoot the
 * cap. Expired rows for the subject are pruned opportunistically so the table
 * does not grow unbounded.
 *
 * On any DB error this fails OPEN (returns `false`) so a transient database
 * blip never blocks legitimate users — matching the lenient intent of the
 * original best-effort in-memory limiter.
 */
export async function consumeRateLimit(opts: RateLimitOptions): Promise<boolean> {
  const { bucket, subject, limit, windowMs } = opts;
  const windowSeconds = windowMs / 1000;
  const lockKey = `${bucket}:${subject}`;

  try {
    return await db.transaction(async (tx) => {
      // Serialize concurrent checks for this exact subject. hashtextextended
      // yields a bigint that fits pg_advisory_xact_lock's single-key overload;
      // the lock is held until this transaction commits/rolls back.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      // Prune anything outside the window first so the count is purely "recent".
      await tx.execute(sql`
        DELETE FROM rate_limit_hits
        WHERE bucket = ${bucket}
          AND subject = ${subject}
          AND hit_at <= now() - make_interval(secs => ${windowSeconds})
      `);

      const countResult: any = await tx.execute(sql`
        SELECT count(*)::int AS c
        FROM rate_limit_hits
        WHERE bucket = ${bucket}
          AND subject = ${subject}
      `);
      const countRows = (countResult?.rows ?? countResult) as Array<{ c: number }>;
      const current = countRows?.[0]?.c ?? 0;

      if (current >= limit) {
        return true; // throttled — do not record a hit
      }

      await tx.execute(sql`
        INSERT INTO rate_limit_hits (bucket, subject)
        VALUES (${bucket}, ${subject})
      `);
      return false;
    });
  } catch (err: any) {
    console.error(
      `[RateLimit] DB check failed for ${bucket}/${subject} — failing open: ${err?.message}`,
    );
    return false;
  }
}
