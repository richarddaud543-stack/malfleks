import { getPrisma } from "@/server/db/client";
import { checkChecksum } from "@/server/payments/clickpesa";
import { logServerError } from "@/server/error-log";

export const dynamic = "force-dynamic";

/**
 * ClickPesa's callback for hosted-checkout payments -- named in
 * malfleks-payment-integration.md's Phase 2 plan, now carrying the full
 * escrow amount per malfleks-escrow-ledger-design.md Section 4.
 *
 * Registered two ways on ClickPesa's side, both pointing here: the
 * Application-level webhook (Developers Settings -> MalFleks application,
 * added 19 Sep 2026, covers every event a hosted checkout link tied to that
 * Client ID can fire) and passed again as `callbackUrl` on each individual
 * checkout-link request in `create-order-with-payment.ts` -- belt and
 * suspenders, since ClickPesa's own docs don't guarantee both are always
 * honored the same way.
 *
 * Four rules this handler holds itself to, straight from that Phase 2 plan:
 *
 *  1. Verify the checksum -- a callback URL is public; anything that posts
 *     to it can claim a payment succeeded unless the signature is checked.
 *  2. Be idempotent -- a guarded `updateMany` (status must still be
 *     "pending"), same discipline as `writeTransition` in
 *     `src/server/orders/status.ts`. A retried webhook for an
 *     already-captured payment is a clean no-op, not a double-count.
 *  3. Never trust `collectedAmount` as the truth -- compare it against the
 *     `OrderPayment.amountTZS` snapshot and refuse to capture on a
 *     mismatch, rather than recording whatever the request claims.
 *  4. Match by `OrderPayment.providerRef`, not `Order.reference` -- the two
 *     coincide for an order's first payment attempt (`providerRef` starts
 *     as `order.reference`, see `create-order-with-payment.ts`), but
 *     `requestPaymentForOrder`'s retries use a suffixed `providerRef` for
 *     every attempt after the first, since ClickPesa 409s on a repeated
 *     `orderReference` and this handler needs to tell which attempt a given
 *     webhook delivery is actually about.
 *
 * Always returns 2xx once the body has been read and its checksum verified,
 * matching ClickPesa's own docs ("this status code only indicates receipt,
 * not successful processing") -- a 4xx/5xx here risks ClickPesa's retry
 * logic hammering an endpoint that is working exactly as designed (e.g.
 * deliberately ignoring a PROCESSING event). The one exception is a bad
 * checksum: that is refused outright, not acknowledged, since acknowledging
 * an unsigned request would look identical to processing a real one.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, reason: "invalid-json" }, { status: 400 });
  }

  const verdict = checkChecksum(body);
  if (!verdict.ok) {
    // The whole body goes into the log, not just a one-line verdict.
    //
    // On 20 Sep 2026 two deliveries were refused here and all that survived
    // was "Checksum verification failed for event PAYMENT RECEIVED". If
    // either had been a real collection, that sentence would have been the
    // only trace of it: no reference, no amount, nothing to reconcile the
    // money against. A refused delivery is the case where evidence matters
    // most, and it was the case that kept none.
    //
    // The body carries `orderReference`, `collectedAmount` and
    // `paymentReference` -- everything needed to settle the payment by hand
    // from the admin console while the cause is fixed. It is the customer's
    // own order data, already in this database, and no card or account
    // number ever appears in a ClickPesa callback.
    await logServerError(
      "clickpesa-webhook-checksum",
      new Error(
        `Refused (${verdict.reason}) event=${String(body.event)} — unverified payload: ` +
          safeBody(body),
      ),
    );
    return Response.json({ ok: false, reason: "bad-checksum" }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : null;
  const data = (body.data ?? {}) as Record<string, unknown>;
  const orderReference = typeof data.orderReference === "string" ? data.orderReference : null;

  if (!event || !orderReference) {
    // Signed, but not a shape this handler recognizes -- acknowledge and
    // move on rather than erroring on something ClickPesa considers valid.
    return Response.json({ ok: true, reason: "ignored-shape" });
  }

  try {
    if (event === "PAYMENT RECEIVED" && data.status === "SUCCESS") {
      await capturePayment(orderReference, data);
    } else if (event === "PAYMENT FAILED") {
      await failPayment(orderReference, data);
    }
    // Every other event (PROCESSING, PAYOUT INITIATED/REFUNDED/REVERSED) is
    // acknowledged and ignored -- MalFleks doesn't disburse payouts through
    // this application yet (see malfleks-escrow-ledger-design.md Section 5),
    // and a PROCESSING payment isn't a decision either side of this system
    // needs to act on yet.
  } catch (error) {
    await logServerError("clickpesa-webhook", error);
    // Still 2xx below: the failure is logged for admin review, and returning
    // an error here would only trigger ClickPesa retries of a request whose
    // failure was on this end, not theirs.
  }

  return Response.json({ ok: true });
}

async function capturePayment(
  providerRef: string,
  data: Record<string, unknown>,
): Promise<void> {
  const paymentReference =
    typeof data.paymentReference === "string" ? data.paymentReference : providerRef;
  const collectedAmount = Number(data.collectedAmount);

  const db = getPrisma();
  const payment = await db.orderPayment.findUnique({
    where: { providerRef },
    select: { id: true, orderId: true, amountTZS: true, status: true },
  });
  // No such attempt, or already captured/failed by an earlier delivery of
  // this same webhook -- either way, nothing to do.
  if (!payment || payment.status !== "pending") return;

  if (!Number.isFinite(collectedAmount) || collectedAmount !== payment.amountTZS) {
    await logServerError(
      "clickpesa-webhook-amount-mismatch",
      new Error(
        `Payment ${providerRef}: collectedAmount=${String(data.collectedAmount)} ` +
          `does not match OrderPayment snapshot ${payment.amountTZS}`,
      ),
    );
    return; // Refuse to capture on a mismatch -- malfleks-payment-integration.md rule 3.
  }

  await db.$transaction(async (tx) => {
    // `providerRef` is overwritten to ClickPesa's own paymentReference on
    // capture -- the lookup above already ran against the pre-capture value
    // (what we sent as `orderReference`), so this rename is safe and does
    // not affect this delivery.
    const { count } = await tx.orderPayment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: { status: "captured", capturedAt: new Date(), providerRef: paymentReference },
    });
    if (count === 0) return; // Lost the race to another delivery of this webhook -- no-op.

    await tx.ledgerEntry.create({
      data: {
        orderId: payment.orderId,
        paymentId: payment.id,
        kind: "collected",
        amountTZS: collectedAmount,
        note: `ClickPesa ${paymentReference}`,
      },
    });
  });
}

async function failPayment(
  providerRef: string,
  data: Record<string, unknown>,
): Promise<void> {
  const db = getPrisma();
  const payment = await db.orderPayment.findUnique({
    where: { providerRef },
    select: { id: true },
  });
  if (!payment) return;

  const message = typeof data.message === "string" ? data.message : null;

  // Guarded the same way: only a still-pending payment can be marked failed,
  // so a FAILED arriving after a RECEIVED already captured it (out-of-order
  // delivery, which HTTP callbacks do not guarantee against) cannot undo a
  // real capture.
  await db.orderPayment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: { status: "failed", failedAt: new Date(), failureNote: message },
  });
}

/**
 * The delivery as JSON, truncated so one malformed post cannot fill the
 * error table. 2,000 characters is far more than a ClickPesa callback has
 * ever been and small enough to read in the admin panel.
 */
function safeBody(body: unknown): string {
  try {
    const text = JSON.stringify(body);
    return text.length > 2000 ? `${text.slice(0, 2000)}…(truncated)` : text;
  } catch {
    return "<unserializable body>";
  }
}
