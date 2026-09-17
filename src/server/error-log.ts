import { getPrisma } from "@/server/db/client";

/**
 * A fallback for real error monitoring (Sentry or similar), which this
 * session cannot set up itself: it needs a new paid-account signup on the
 * owner's behalf, which is outside what these tools are permitted to do.
 * This is Postgres, not a queue or a dashboard product — it answers the one
 * question that actually matters day to day, "did anything break, and
 * what", from a table `/admin` can read. Swapping in a real provider later
 * means changing this one module, not every call site.
 *
 * ## Where this is called from
 *
 * Every Server Action's outer `catch` in this codebase deliberately returns
 * an opaque reason ("unavailable", "failed") to the caller — the actual
 * cause is not the caller's business and may name internals. That opacity is
 * correct and unchanged; this only stops the cause from being thrown away
 * entirely. Call it as the first thing inside a `catch` block, before
 * building the opaque result:
 *
 * ```ts
 * } catch (error) {
 *   await logServerError("submit-order", error);
 *   return { ok: false, reason: "unavailable" };
 * }
 * ```
 *
 * ## Failure is silent, on purpose
 *
 * This function never throws. A database outage that broke the action being
 * logged would just as easily break the log write, and a user-facing failure
 * must never become a *worse* failure because logging it didn't work.
 */
export async function logServerError(
  context: string,
  error: unknown,
  uid?: string | null,
): Promise<void> {
  try {
    const message =
      error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const prisma = getPrisma();
    await prisma.serverErrorLog.create({
      data: {
        context,
        // Bounded so one runaway message or stack can't bloat the table —
        // this is a signal to look closer, not a full crash report.
        message: message.slice(0, 2000),
        stack: stack ? stack.slice(0, 4000) : undefined,
        uid: uid ?? undefined,
      },
    });

    // Opportunistic cleanup, same discipline as `checkRateLimit`: this table
    // has no cron of its own, so each write is also a chance to drop what's
    // aged out. 30 days is far more than `/admin` ever needs to look back.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    await prisma.serverErrorLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  } catch {
    // See the doc comment above: logging must never be the thing that fails.
  }
}

export interface RecentServerError {
  id: string;
  context: string;
  message: string;
  stack: string | null;
  uid: string | null;
  createdAt: Date;
}

/**
 * The newest logged errors, for `/admin`. Never throws: a broken read here
 * must not take the rest of the admin page down with it — callers get an
 * empty list on failure, same shape as "nothing has gone wrong yet".
 */
export async function recentServerErrors(limit = 20): Promise<RecentServerError[]> {
  try {
    return await getPrisma().serverErrorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}
