import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";
import { returnWindowOpen } from "@/lib/returns";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { returnRequestAdminBody, returnRequestedMessage, sendCustomerEmail } from "@/server/notify/email";
import { raiseAlert } from "@/server/rules/alerts";

/**
 * A customer asking to return an order they have received.
 *
 * Tanzania's Electronic Transactions Act, 2015, s.30 gives a customer seven
 * days after receiving goods to cancel, a refund within thirty days, and the
 * cost of sending them back as their only charge. Until 12 Oct 2026 the site
 * neither said so nor offered a way to do it.
 *
 * Like "Ask to cancel" on a paid order (`customer-cancel.ts`), this changes
 * nothing on the order by itself. Goods have to come back, the branch has
 * already been paid, and whether this item is excluded (food, drinks, everyday
 * goods) is a judgement -- so the request becomes an owner alert, which is
 * stored, emailed to the owner, and listed in the console with "I'm handling
 * this" and "Done" until somebody deals with it. The customer is emailed what
 * happens next.
 *
 * One open request per order: the alert's key is the order, so pressing the
 * button twice cannot raise two. Every read is `WHERE reference AND
 * customerId`, so someone else's reference reads as `not-found`.
 */

export type ReturnRequestOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not-found"
        /** Not delivered (yet), or cancelled: nothing to return. */
        | "not-delivered"
        /** More than seven days since delivery. */
        | "too-late"
        /** A request for this order is already open. */
        | "already-asked";
    };

export const RETURN_ALERT_KEY = "return-request";

export async function requestReturnAsCustomer(
  customerId: string,
  reference: string,
  now: number = Date.now(),
): Promise<ReturnRequestOutcome> {
  const order = await getPrisma().order.findFirst({
    where: { reference, customerId },
    select: {
      id: true,
      status: true,
      decidedAt: true,
      reference: true,
      productName: true,
      quantity: true,
      branchName: true,
      customerFullName: true,
      customerPhone: true,
      customerEmail: true,
    },
  });
  if (!order) return { ok: false, reason: "not-found" };
  // `decidedAt` is the time of the last status change, which for a
  // fulfilled order is when it was recorded as delivered.
  if (order.status !== "fulfilled" || !order.decidedAt) return { ok: false, reason: "not-delivered" };
  if (!returnWindowOpen(order.decidedAt, now)) return { ok: false, reason: "too-late" };

  const raised = await raiseAlert({
    key: RETURN_ALERT_KEY,
    subjectId: order.id,
    urgency: "routine",
    subject: `${order.reference}: the customer wants to return it`,
    body: returnRequestAdminBody({
      reference: order.reference,
      productName: order.productName,
      quantity: order.quantity,
      branchName: order.branchName,
      customerName: order.customerFullName,
      customerPhone: order.customerPhone,
      deliveredAt: order.decidedAt,
    }),
    href: `/admin/orders/${order.id}`,
    data: { orderId: order.id, reference: order.reference, requestedAt: new Date(now).toISOString() },
  });
  // Not raised: one is already open for this order (or the write failed, which
  // `raiseAlert` has logged). Either way, saying "already asked" sends the
  // customer to their inbox rather than pressing again.
  if (!raised.raised) return { ok: false, reason: "already-asked" };

  const firstName = order.customerFullName.trim().split(/\s+/)[0] || null;
  const { subject, body } = returnRequestedMessage({
    firstName,
    reference: order.reference,
    productName: order.productName,
    branchName: order.branchName,
    contactEmail: MALFLEKS_CONTACT_EMAIL,
  });
  const sent = await sendCustomerEmail(order.customerEmail, subject, body);
  if (!sent.sent && sent.reason !== "not-configured" && sent.reason !== "no-address") {
    await logServerError("return-request", new Error(`Could not email the customer about returning ${order.reference}: ${sent.reason}`), customerId);
  }
  return { ok: true };
}
