import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { accruePayouts } from "@/server/money/payouts";

/**
 * Recording that money arrived, or that an attempt failed -- in one place.
 *
 * There are now two roads to a captured payment: the ClickPesa webhook, and
 * reconciliation (`reconcile.ts`), which asks ClickPesa directly. They must
 * apply identical rules, and the only way to guarantee two code paths agree
 * forever is for them to be one code path. This module is that path; it was
 * lifted out of `src/app/api/payments/clickpesa/route.ts` unchanged except
 * for the one fix described on `capturePayment`.
 *
 * The rules, from `malfleks-payment-integration.md`'s Phase 2 plan:
 *
 *  1. Match by `OrderPayment.providerRef` -- what was sent as `orderReference`.
 *  2. Never trust the reported amount as the truth: it must equal the
 *     `amountTZS` snapshot taken when the link was created, or nothing is
 *     recorded.
 *  3. Be idempotent: a second delivery, or the webhook and reconciliation
 *     both arriving for the same payment, captures exactly once.
 */

export type CaptureOutcome =
  | "captured"
  /** Already captured -- by an earlier delivery, or by the other road. A clean no-op. */
  | "already-captured"
  /** No payment with this reference. After a capture `providerRef` is renamed to
   * ClickPesa's own reference, so a late duplicate also lands here, harmlessly. */
  | "no-such-payment"
  | "amount-mismatch";

export interface CaptureInput {
  /** What was sent to ClickPesa as `orderReference`. */
  providerRef: string;
  /** ClickPesa's own reference for the collection. Falls back to `providerRef`. */
  paymentReference: string | null;
  collectedAmount: number;
  /** Which road recorded it -- written into the ledger note, so the audit trail says. */
  source: "webhook" | "reconcile";
}

/**
 * Record a collected payment and its ledger entry.
 *
 * ## The fix: a failed payment can still be captured
 *
 * The webhook used to capture only a payment still in `pending`. A
 * `PAYMENT FAILED` event moves it to `failed` -- and a hosted checkout link
 * stays usable after a failure. A customer whose first attempt bounced and who
 * retried on the same link a minute later would pay, ClickPesa would report
 * `PAYMENT RECEIVED`, and the capture would refuse it because the row said
 * `failed`. Money collected, nothing recorded: precisely the failure the whole
 * escrow design exists to prevent, reachable by a customer doing nothing
 * stranger than trying twice.
 *
 * What capture must refuse is a *second capture*, not a capture after a
 * failure. So the guard is now "not already captured": `pending` and `failed`
 * can both move to `captured`; `captured` cannot move anywhere. `failedAt` and
 * `failureNote` are left as they were, as the record that the first attempt
 * did fail.
 */
export async function capturePayment(input: CaptureInput): Promise<CaptureOutcome> {
  const paymentReference = input.paymentReference ?? input.providerRef;
  const db = getPrisma();

  const payment = await db.orderPayment.findUnique({
    where: { providerRef: input.providerRef },
    select: { id: true, orderId: true, amountTZS: true, status: true },
  });
  if (!payment) return "no-such-payment";
  if (payment.status === "captured") return "already-captured";

  if (!Number.isFinite(input.collectedAmount) || input.collectedAmount !== payment.amountTZS) {
    await logServerError(
      `clickpesa-${input.source}-amount-mismatch`,
      new Error(
        `Payment ${input.providerRef}: collectedAmount=${String(input.collectedAmount)} ` +
          `does not match OrderPayment snapshot ${payment.amountTZS}`,
      ),
    );
    return "amount-mismatch";
  }

  return db.$transaction(async (tx) => {
    // The lookup above ran against the pre-capture reference; renaming
    // `providerRef` to ClickPesa's own reference here does not affect it.
    const { count } = await tx.orderPayment.updateMany({
      where: { id: payment.id, status: { in: ["pending", "failed"] } },
      data: { status: "captured", capturedAt: new Date(), providerRef: paymentReference },
    });
    // Lost the race to the other road, or a concurrent delivery. No-op.
    if (count === 0) return "already-captured" as const;

    await tx.ledgerEntry.create({
      data: {
        orderId: payment.orderId,
        paymentId: payment.id,
        kind: "collected",
        amountTZS: input.collectedAmount,
        note:
          input.source === "reconcile"
            ? `ClickPesa ${paymentReference} · reconciled`
            : `ClickPesa ${paymentReference}`,
      },
    });
    // Paid after it was already delivered: split it now, since the
    // fulfilment transition found nothing to split. A no-op otherwise.
    await accruePayouts(tx, payment.orderId);
    return "captured" as const;
  });
}

/**
 * Mark a still-pending payment failed. Only the webhook calls this --
 * reconciliation never fails a payment; see `decideSettlement`.
 *
 * Guarded on `pending`, so a FAILED arriving after a capture (HTTP callbacks
 * are not ordered) cannot undo it.
 */
export async function failPayment(providerRef: string, message: string | null): Promise<void> {
  const db = getPrisma();
  const payment = await db.orderPayment.findUnique({
    where: { providerRef },
    select: { id: true },
  });
  if (!payment) return;

  await db.orderPayment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: { status: "failed", failedAt: new Date(), failureNote: message },
  });
}
