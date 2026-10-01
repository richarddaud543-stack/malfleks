import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { queryPaymentStatus } from "./clickpesa";
import { decideSettlement, isDueForCheck, RECONCILE_WINDOW_DAYS } from "./reconcile-rules";
import { capturePayment } from "./settle";

/**
 * Reconciliation: asking ClickPesa what happened to a payment, and recording
 * it if the money arrived -- independently of the webhook.
 *
 * The decisions live in `reconcile-rules.ts` (pure, tested); the capture lives
 * in `settle.ts` (shared with the webhook, so the two roads cannot disagree).
 * This file is only the I/O that strings them together.
 *
 * Three callers, each with its own budget against the account's 100 API calls
 * a day (until KYC lifts the cap):
 *   - the daily cron (`/api/cron/reconcile`)            -- everything due
 *   - opening the Money page                            -- a few, throttled
 *   - the "Check now" buttons on the Money page         -- on demand
 */

export type ReconcileOutcome =
  | "captured"
  | "already-captured"
  | "amount-mismatch"
  /** ClickPesa has nothing collected for it yet. Not a failure -- the customer may not have paid. */
  | "waiting"
  /** The check itself failed (auth, network, ClickPesa error). Logged; retried next time. */
  | "check-failed";

export interface ReconcileResult {
  paymentId: string;
  providerRef: string;
  outcome: ReconcileOutcome;
  providerStatus: string | null;
}

/** Check one payment now, regardless of when it was last checked. */
export async function reconcilePayment(paymentId: string): Promise<ReconcileResult | null> {
  const db = getPrisma();
  const payment = await db.orderPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, providerRef: true, status: true, providerStatus: true },
  });
  if (!payment) return null;

  const base = { paymentId: payment.id, providerRef: payment.providerRef };
  if (payment.status === "captured") {
    return { ...base, outcome: "already-captured", providerStatus: payment.providerStatus };
  }

  const answer = await queryPaymentStatus(payment.providerRef);
  const checkedAt = new Date();

  if (!answer.ok) {
    await db.orderPayment.update({
      where: { id: payment.id },
      // Recorded as checked even though the check failed, so a broken
      // credential cannot turn the page-load throttle into a retry storm that
      // burns the day's API budget in an afternoon.
      data: { lastCheckedAt: checkedAt, providerStatus: "CHECK_FAILED" },
    });
    await logServerError(
      "clickpesa-reconcile",
      new Error(`${payment.providerRef}: ${answer.reason}: ${answer.detail ?? "no detail given"}`),
    );
    return { ...base, outcome: "check-failed", providerStatus: "CHECK_FAILED" };
  }

  const decision = answer.found
    ? decideSettlement(answer.records)
    : ({ action: "wait", providerStatus: "NO_ATTEMPTS" } as const);

  await db.orderPayment.update({
    where: { id: payment.id },
    data: { lastCheckedAt: checkedAt, providerStatus: decision.providerStatus },
  });

  if (decision.action === "wait") {
    return { ...base, outcome: "waiting", providerStatus: decision.providerStatus };
  }

  const captured = await capturePayment({
    providerRef: payment.providerRef,
    paymentReference: decision.paymentReference,
    collectedAmount: decision.collectedAmount,
    source: "reconcile",
  });

  return {
    ...base,
    // "no-such-payment" here means the webhook captured it between our read
    // and our capture, renaming `providerRef` -- the payment IS recorded.
    outcome: captured === "no-such-payment" ? "already-captured" : captured,
    providerStatus: decision.providerStatus,
  };
}

/**
 * Check every open payment that is due, oldest-checked first, up to `limit`.
 *
 * "Open" includes `failed`: a failed attempt can be followed by a successful
 * retry on the same checkout link (see `capturePayment` in settle.ts), and
 * that success needs a road to the ledger too. Payments older than
 * RECONCILE_WINDOW_DAYS are left to the manual button.
 *
 * Runs sequentially on purpose. Parallel checks would finish a little sooner
 * and hit ClickPesa's per-account limits a lot sooner.
 */
export async function reconcileDue(options: {
  staleAfterMinutes: number;
  limit: number;
}): Promise<ReconcileResult[]> {
  const db = getPrisma();
  const now = new Date();
  const since = new Date(now.getTime() - RECONCILE_WINDOW_DAYS * 86_400_000);

  const open = await db.orderPayment.findMany({
    where: { status: { in: ["pending", "failed"] }, initiatedAt: { gte: since } },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { initiatedAt: "asc" }],
    select: { id: true, lastCheckedAt: true },
    take: 200,
  });

  const due = open
    .filter((p) => isDueForCheck(p.lastCheckedAt, now, options.staleAfterMinutes))
    .slice(0, options.limit);

  const results: ReconcileResult[] = [];
  for (const p of due) {
    try {
      const result = await reconcilePayment(p.id);
      if (result) results.push(result);
    } catch (error) {
      // One bad row must not stop the rest of the run.
      await logServerError("clickpesa-reconcile", error);
    }
  }
  return results;
}
