import { checkChecksum } from "@/server/payments/clickpesa";
import { capturePayment, failPayment } from "@/server/payments/settle";
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
 *  2. Be idempotent -- a guarded `updateMany` that refuses a payment
 *     already `captured` (see `capturePayment` in
 *     `src/server/payments/settle.ts`, which both this route and
 *     reconciliation call). A retried webhook, or the webhook arriving after
 *     reconciliation already recorded the payment, is a clean no-op.
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
      // Same function reconciliation uses -- see src/server/payments/settle.ts.
      await capturePayment({
        providerRef: orderReference,
        paymentReference:
          typeof data.paymentReference === "string" ? data.paymentReference : null,
        collectedAmount: Number(data.collectedAmount),
        payerPhone: typeof data.paymentPhoneNumber === "string" ? data.paymentPhoneNumber : null,
        source: "webhook",
      });
    } else if (event === "PAYMENT FAILED") {
      await failPayment(orderReference, typeof data.message === "string" ? data.message : null);
    } else if (event.startsWith("PAYOUT ")) {
      // A payout MalFleks sent itself (see src/server/money/auto-payouts.ts).
      // `orderReference` is the batch's `sendRef`; one that is not ours (a
      // payout made by hand from the dashboard) matches nothing and is ignored.
      // The status in the body is applied by the same function the send and
      // the status check use, so all three roads agree. For REFUNDED and
      // REVERSED the event name itself is the status if the body has none.
      const fromEvent = event === "PAYOUT REFUNDED" ? "REFUNDED" : event === "PAYOUT REVERSED" ? "REVERSED" : null;
      const status = (typeof data.status === "string" && data.status.trim() ? data.status.trim().toUpperCase() : null) ?? fromEvent ?? "UNKNOWN";
      const fee = Number(data.fee);
      const record = {
        status: fromEvent ?? status,
        id: typeof data.id === "string" && data.id ? data.id : null,
        orderReference,
        feeTZS: Number.isFinite(fee) ? fee : null,
      };
      const { settlePayoutFromProvider } = await import("@/server/money/auto-payouts");
      const { outcome, batchId } = await settlePayoutFromProvider(orderReference, record);
      if (outcome === "not-ours") {
        // Not a partner payout. A refund MalFleks sent a customer is also a
        // ClickPesa payout (see src/server/money/refund-send.ts) and is
        // reported here the same way; a reference that is neither is ignored.
        const { applyRefundAnswer } = await import("@/server/money/refund-send");
        await applyRefundAnswer(orderReference, record);
      } else if (batchId && outcome === "paid") {
        const { notifyPayoutSent } = await import("@/server/notify/events");
        await notifyPayoutSent(batchId);
      } else if (batchId && outcome === "returned") {
        const { notifyAutoPayoutNeedsAttention } = await import("@/server/notify/events");
        await notifyAutoPayoutNeedsAttention(batchId);
      }
    }
    // Every other event (a PROCESSING payment) is acknowledged and ignored:
    // it isn't a decision either side of this system needs to act on.
  } catch (error) {
    await logServerError("clickpesa-webhook", error);
    // Still 2xx below: the failure is logged for admin review, and returning
    // an error here would only trigger ClickPesa retries of a request whose
    // failure was on this end, not theirs.
  }

  return Response.json({ ok: true });
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
