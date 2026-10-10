import type { ClickPesaPaymentRecord } from "./clickpesa";

/**
 * The decisions reconciliation makes, with no database and no network --
 * so every rule here is a plain function a test can pin down exactly.
 * `reconcile.ts` does the I/O around them.
 */

/** ClickPesa statuses that mean the money has actually been collected. */
const COLLECTED = new Set(["SUCCESS", "SETTLED"]);

/** How far back automatic checks look. A checkout link older than this is
 * abandoned in practice, and polling it forever spends the account's 100
 * API calls a day on nothing. A manual "Check now" ignores this window. */
export const RECONCILE_WINDOW_DAYS = 30;

export type SettlementDecision =
  | {
      action: "capture";
      /** `null` means ClickPesa omitted it; the caller falls back to the order reference, as the webhook does. */
      paymentReference: string | null;
      collectedAmount: number;
      providerStatus: string;
      /** The wallet that paid, when ClickPesa said. Absent, never guessed. */
      payerPhone?: string;
    }
  | { action: "wait"; providerStatus: string };

/**
 * What to do with what ClickPesa reported for one order reference.
 *
 * ## It never decides "failed"
 *
 * Reconciliation can capture a payment or leave it alone. It never marks one
 * failed, even when every attempt ClickPesa reports is FAILED -- and that
 * asymmetry is deliberate. A hosted checkout link stays usable after a failed
 * attempt: the customer can retry on the same link a minute later. Marking
 * the payment failed buys nothing but a label, and if the retry then succeeds
 * the capture has to be able to happen anyway. So a FAILED attempt is
 * recorded as `providerStatus` for the admin to see, and the payment stays
 * open for the success that may still come.
 *
 * ## Any success wins
 *
 * One reference can carry several attempts. If any of them collected money,
 * that is the fact that matters -- a FAILED attempt beside it was a retry that
 * happened before the one that worked. The latest successful attempt is used.
 *
 * ## A success without an amount is not captured
 *
 * The capture rule refuses to record an amount that does not match the
 * order's snapshot. A success record with no readable `collectedAmount` cannot
 * be checked against anything, so it waits -- loudly, under its own status --
 * rather than being trusted.
 */
export function decideSettlement(records: ClickPesaPaymentRecord[]): SettlementDecision {
  const successes = records
    .filter((r) => COLLECTED.has(r.status))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  if (successes.length > 0) {
    const best = successes.find((r) => r.collectedAmount !== null);
    if (!best || best.collectedAmount === null) {
      return { action: "wait", providerStatus: "SUCCESS_WITHOUT_AMOUNT" };
    }
    return {
      action: "capture",
      paymentReference: best.paymentReference,
      collectedAmount: best.collectedAmount,
      providerStatus: best.status,
      ...(best.payerPhone ? { payerPhone: best.payerPhone } : {}),
    };
  }

  if (records.length === 0) return { action: "wait", providerStatus: "NO_ATTEMPTS" };

  const latest = [...records].sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  )[0];
  return { action: "wait", providerStatus: latest.status };
}

/**
 * Is a payment due an automatic check?
 *
 * The account is capped at 100 API calls a day until KYC clears, and every
 * check costs one. Without a throttle, an admin leaving the Money page open
 * and refreshing would spend the whole day's budget on one pending payment and
 * leave nothing for generating checkout links -- the thing that earns money.
 */
export function isDueForCheck(
  lastCheckedAt: Date | null,
  now: Date,
  staleAfterMinutes: number,
): boolean {
  if (!lastCheckedAt) return true;
  return now.getTime() - lastCheckedAt.getTime() >= staleAfterMinutes * 60_000;
}

/** Is a payment recent enough to be worth checking automatically? */
export function withinReconcileWindow(initiatedAt: Date, now: Date): boolean {
  return now.getTime() - initiatedAt.getTime() <= RECONCILE_WINDOW_DAYS * 86_400_000;
}
