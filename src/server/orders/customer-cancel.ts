import { resolveAdminUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { cancelRequestAdminMessage, sendNotification } from "@/server/notify/email";
import { notifyOrderCancelled } from "@/server/notify/events";
import { checkRateLimit } from "@/server/rate-limit";
import { cancelOrderByCustomer } from "./status";

/**
 * A customer cancelling one of their own orders.
 *
 * Until 4 Oct 2026 there was no way to do this on the site at all: the Terms
 * said "contact us", and the only contact was an email address. Two cases,
 * and they are deliberately different:
 *
 * - **Not paid yet** -- the order is cancelled on the spot. Nothing was
 *   charged, nothing was sent to the branch to prepare, and nobody needs to
 *   be asked.
 * - **Paid, not yet delivered** -- the order is *not* cancelled here. Money is
 *   held, the branch may already be on its way, and what is refunded is a
 *   decision MalFleks has to make. So the request goes to MalFleks's inbox
 *   with the reference, the customer is told it has been passed on, and an
 *   admin cancels the order and records the refund from the console.
 *
 * Every read is `WHERE reference AND customerId`, the same rule `/track` and
 * `/pay` use: someone else's reference matches nothing and reads as
 * `not-found`.
 */

export type CustomerCancelOutcome =
  | { ok: true; kind: "cancelled" }
  /** Paid: MalFleks has been asked. Nothing has changed on the order. */
  | { ok: true; kind: "requested" }
  | {
      ok: false;
      reason:
        | "not-found"
        /** Already delivered or already cancelled. */
        | "too-late"
        /** Already asked about this paid order today. */
        | "already-asked";
    };

/** One request per paid order per day: a customer pressing the button again must not flood the inbox. */
const ASK_LIMIT = { action: "cancel-request", limit: 1, windowMs: 24 * 60 * 60_000 };

export async function cancelOrderAsCustomer(customerId: string, reference: string): Promise<CustomerCancelOutcome> {
  const order = await getPrisma().order.findFirst({
    where: { reference, customerId },
    select: {
      id: true,
      status: true,
      reference: true,
      productName: true,
      quantity: true,
      customerFullName: true,
      customerPhone: true,
      payments: { where: { status: "captured" }, select: { id: true }, take: 1 },
    },
  });
  if (!order) return { ok: false, reason: "not-found" };
  if (order.status !== "pending" && order.status !== "confirmed") return { ok: false, reason: "too-late" };

  if (order.payments.length === 0) {
    const moved = await cancelOrderByCustomer(order.id, customerId);
    // The guarded write refused: the order was paid for, delivered or
    // cancelled in the moment since the read above. The page reloads and
    // shows which.
    if (!moved.ok) return { ok: false, reason: "too-late" };
    await notifyOrderCancelled(order.id);
    return { ok: true, kind: "cancelled" };
  }

  const limit = await checkRateLimit(`order:${order.id}`, ASK_LIMIT);
  if (!limit.allowed) return { ok: false, reason: "already-asked" };

  const { subject, body } = cancelRequestAdminMessage({
    reference: order.reference,
    productName: order.productName,
    quantity: order.quantity,
    customerName: order.customerFullName,
    customerPhone: order.customerPhone,
    adminUrl: resolveAdminUrl(),
    orderId: order.id,
  });
  const sent = await sendNotification(subject, body);
  if (!sent.sent && sent.reason !== "not-configured") {
    await logServerError("cancel-request", new Error(`Could not email the cancel request for ${order.reference}: ${sent.reason}`), customerId);
  }
  return { ok: true, kind: "requested" };
}
