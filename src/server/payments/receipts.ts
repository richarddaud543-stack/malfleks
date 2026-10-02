import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import {
  paymentReceivedAdminMessage,
  paymentReceivedMessage,
  sendCustomerEmail,
  sendNotification,
} from "@/server/notify/email";

/**
 * Tell people money arrived: a receipt to the customer, a note to MalFleks.
 *
 * Called once, by `capturePayment`, after the capture has committed -- so it
 * runs for the webhook and for reconciliation alike, and only for the call
 * that actually captured (a second delivery returns "already-captured" and
 * never reaches here). Best-effort by design: the payment is recorded whether
 * or not an email provider is reachable, and nothing here can undo it.
 */
export async function sendPaymentReceipts(paymentId: string): Promise<void> {
  try {
    const payment = await getPrisma().orderPayment.findUnique({
      where: { id: paymentId },
      select: {
        amountTZS: true,
        providerRef: true,
        order: { select: { reference: true, productName: true, customerFullName: true, customerEmail: true } },
      },
    });
    if (!payment) return;

    const { order } = payment;
    const adminHost = process.env.MALFLEKS_ADMIN_HOST?.trim();

    const receipt = paymentReceivedMessage({
      firstName: order.customerFullName.trim().split(/\s+/)[0] || null,
      reference: order.reference,
      productName: order.productName,
      amountTZS: payment.amountTZS,
      paymentReference: payment.providerRef,
      siteUrl: resolveSiteUrl(),
    });
    const note = paymentReceivedAdminMessage({
      reference: order.reference,
      amountTZS: payment.amountTZS,
      adminUrl: adminHost ? `https://${adminHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : null,
    });

    await Promise.all([
      sendCustomerEmail(order.customerEmail, receipt.subject, receipt.body),
      sendNotification(note.subject, note.body),
    ]);
  } catch (error) {
    await logServerError("payment-receipt", error);
  }
}
