import { headers } from "next/headers";

import { getPrisma } from "@/server/db/client";

/**
 * A fixed-window rate limiter backed by Postgres, not Redis.
 *
 * MalFleks has no Redis/Upstash account, and every write this guards already
 * pays for a Postgres round trip on the same request — adding a second store
 * just to count hits would be new infrastructure for a marginal win. The
 * traffic these endpoints see (one partner, one form, one tap) is nowhere
 * near what would need something faster.
 *
 * ## What "fixed window" gives up
 *
 * This is a sliding *count*, not a sliding window, and it is not perfectly
 * atomic: a burst of concurrent requests from the same caller can each read
 * the count before any of them writes their own row, letting a few more
 * through than `limit` in the rare case of a true race. That is an accepted
 * trade, not an oversight — the callers this guards are one signed-in human
 * driving one form or button, never a load-tested API, so an occasional
 * off-by-one or two costs nothing worth a transaction-level lock for.
 * `submitProduct`'s own guard (`updateMany` with a `WHERE status = pending`)
 * is the pattern for when a race genuinely must be closed; this isn't that.
 * @see submitProduct in ./partners/submissions.ts
 */
export interface RateLimitConfig {
  /** A short, stable name for the thing being limited, e.g. `"submit-order"`. */
  action: string;
  /** Max accepted calls inside the window. */
  limit: number;
  /** Window length, in milliseconds. */
  windowMs: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/**
 * Checks and records one call against a caller's limit for one action.
 *
 * `identity` must be the most specific caller identity the site actually
 * has — in practice, the verified session's uid. Never an IP: Vercel's
 * serverless functions don't reliably expose one, and in Tanzania many real
 * customers share one carrier-NAT address, which would rate-limit strangers
 * together. Every call site here runs after its own `verifySession()`, so a
 * signed-out caller never reaches this function at all — the "public write
 * endpoint" this protects is already gated on being someone, not anyone.
 */
export async function checkRateLimit(
  identity: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const prisma = getPrisma();
  const key = `${config.action}:${identity}`;
  const windowStart = new Date(Date.now() - config.windowMs);

  // Opportunistic cleanup, scoped to this caller's own key only — this never
  // scans or locks any other caller's rows, so it costs nothing to run on
  // every check rather than on a schedule this app has no cron for.
  await prisma.rateLimitHit.deleteMany({
    where: { key, createdAt: { lt: windowStart } },
  });

  const count = await prisma.rateLimitHit.count({ where: { key } });
  if (count >= config.limit) {
    const oldest = await prisma.rateLimitHit.findFirst({
      where: { key },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const retryAfterMs = oldest
      ? Math.max(0, oldest.createdAt.getTime() + config.windowMs - Date.now())
      : config.windowMs;
    return { allowed: false, retryAfterMs };
  }

  await prisma.rateLimitHit.create({ data: { key } });
  return { allowed: true };
}

/**
 * Best-effort caller address for the one write action that has no session to
 * key by at all — see `submitOrder` in `src/app/actions/orders.ts`, which
 * accepts a signed-out order on purpose (see its own doc comment).
 *
 * This is deliberately coarser than a uid-keyed limit and paired with a
 * generous ceiling wherever it's used: `x-forwarded-for` is client-influenced
 * and, in Tanzania, often shared by many real customers behind one carrier's
 * NAT, so treating it as identity for a *tight* limit would rate-limit
 * strangers together. It exists as a backstop against a script hammering an
 * endpoint with no session at all, not as a precise per-person throttle. Never
 * reuse this for an action that already has a signed-in caller — use the
 * session's uid instead, exactly as every other call site here does.
 */
export async function clientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}
