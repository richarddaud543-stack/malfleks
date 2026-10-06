import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import {
  paymentReceivedAdminMessage,
  paymentReceivedMessage,
  sendCustomerEmail,
  sendNotification,
} from "@/server/notify/email";
import { deliveryCodeSms, sendSms } from "@/server/notify/sms";

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
        order: {
          select: {
            id: true,
            status: true,
            reference: true,
            productName: true,
            customerFullName: true,
            customerEmail: true,
            customerPhone: true,
            deliveryCode: { select: { code: true, smsSentAt: true } },
          },
        },
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
      // Only while there is still a delivery to confirm: an order paid for
      // after it was delivered or cancelled has no use for a code.
      deliveryCode: order.status === "confirmed" ? (order.deliveryCode?.code ?? null) : null,
    });
    const note = paymentReceivedAdminMessage({
      reference: order.reference,
      amountTZS: payment.amountTZS,
      adminUrl: adminHost ? `https://${adminHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : null,
    });

    await Promise.all([
      sendCustomerEmail(order.customerEmail, receipt.subject, receipt.body),
      sendNotification(note.subject, note.body),
      sendDeliveryCodeSms(order),
    ]);
  } catch (error) {
    await logServerError("payment-receipt", error);
  }
}

/**
 * Text the customer their delivery code, once.
 *
 * `smsSentAt` is claimed with a guarded write *before* sending, so a webhook
 * and a reconciliation arriving together cannot both text the customer. If the
 * text then fails the claim is given back, and the failure is logged -- the
 * code is still on their order page and in the email above.
 */
async function sendDeliveryCodeSms(order: {
  id: string;
  status: string;
  reference: string;
  customerPhone: string;
  deliveryCode: { code: string; smsSentAt: Date | null } | null;
}): Promise<void> {
  if (order.status !== "confirmed" || !order.deliveryCode || order.deliveryCode.smsSentAt) return;
  const db = getPrisma();
  const claimed = await db.deliveryCode.updateMany({
    where: { orderId: order.id, smsSentAt: null },
    data: { smsSentAt: new Date() },
  });
  if (claimed.count !== 1) return;

  const result = await sendSms(order.customerPhone, deliveryCodeSms({ reference: order.reference, code: order.deliveryCode.code }));
  if (result.sent) return;
  await db.deliveryCode.updateMany({ where: { orderId: order.id }, data: { smsSentAt: null } });
  // "No provider set up" and "not a mobile number" are normal; a provider that
  // said no is worth a line.
  if (result.reason === "rejected" || result.reason === "failed") {
    await logServerError("delivery-code-sms", new Error(`Could not text the delivery code for ${order.reference}: ${result.reason} ${result.detail ?? ""}`));
  }
}
