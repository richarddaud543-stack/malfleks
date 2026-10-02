import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { paymentReadyMessage, sendCustomerEmail } from "@/server/notify/email";
import { reconcilePayment } from "@/server/payments/reconcile";
import { checkRateLimit } from "@/server/rate-limit";
import { requestPaymentForOrder, type RequestPaymentFailure } from "./create-order-with-payment";

/**
 * The customer's checkout: opened automatically, paid from a MalFleks page.
 *
 * Until 2 Oct 2026 a payment link existed only when an admin pressed "Send
 * payment link" and then copied it to the customer by hand. The owner's call
 * that day: the link should simply be ready, in the app, the moment the order
 * is confirmed. So:
 *
 *  1. `openCheckout` runs right after an admin confirms an order. It creates
 *     the ClickPesa link and emails the customer where to pay.
 *  2. `/pay/[reference]` shows the customer their order and a Pay button.
 *     If step 1 did not produce a link (ClickPesa was down, the order predates
 *     this), opening the page creates it then.
 *  3. Paying happens on ClickPesa's hosted page; the webhook or reconciliation
 *     records it, exactly as before. Nothing here marks anything paid.
 *
 * What did **not** change: payment still comes *after* the branch confirms
 * stock and price. An order is never charged at submission, so nobody pays
 * for something that turns out to be unavailable.
 *
 * Only a signed-in customer has an order row at all (see `submitOrder`), and
 * every read here is `WHERE reference AND customerId` -- someone else's
 * reference matches nothing, the same rule `/track` uses.
 */

export type OpenCheckoutOutcome =
  | { ok: true; reused: boolean; emailed: boolean }
  | { ok: false; reason: RequestPaymentFailure };

/** Called after an order is confirmed. Never throws; a failure is logged and the page self-heals later. */
export async function openCheckout(orderId: string): Promise<OpenCheckoutOutcome> {
  const outcome = await requestPaymentForOrder(orderId);
  if (!outcome.ok) return outcome;
  // A reused link means the customer was already told about it once.
  if (outcome.reused) return { ok: true, reused: true, emailed: false };

  const order = await getPrisma().order.findUnique({
    where: { id: orderId },
    select: {
      reference: true,
      productName: true,
      quantity: true,
      branchName: true,
      customerFullName: true,
      customerEmail: true,
      quoteOrderTotalTZS: true,
    },
  });
  if (!order || order.quoteOrderTotalTZS == null) return { ok: true, reused: false, emailed: false };

  const { subject, body } = paymentReadyMessage({
    firstName: order.customerFullName.trim().split(/\s+/)[0] || null,
    reference: order.reference,
    productName: order.productName,
    quantity: order.quantity,
    branchName: order.branchName,
    totalTZS: order.quoteOrderTotalTZS,
    siteUrl: resolveSiteUrl(),
  });
  const sent = await sendCustomerEmail(order.customerEmail, subject, body);
  if (!sent.sent && sent.reason !== "no-address" && sent.reason !== "not-configured") {
    await logServerError("checkout-email", new Error(`Could not email the checkout link for ${order.reference}: ${sent.reason}`));
  }
  return { ok: true, reused: false, emailed: sent.sent };
}

export type CheckoutState =
  /** The branch has not confirmed yet. Nothing to pay. */
  | "waiting"
  /** Confirmed and unpaid, with a link to pay. */
  | "ready"
  | "paid"
  | "cancelled"
  /** Confirmed but no link could be made (no delivery fee set for the route, or ClickPesa refused). */
  | "unavailable";

export interface CheckoutView {
  reference: string;
  state: CheckoutState;
  orderStatus: string;
  productName: string;
  quantity: number;
  unitPriceTZS: number;
  goodsTZS: number;
  deliveryFeeTZS: number;
  totalTZS: number | null;
  branchName: string;
  branchCity: string;
  routeKind: string;
  routeCarrier: string;
  customerPhone: string;
  checkoutLink: string | null;
  /** The last attempt bounced; the same link can be used again. */
  lastAttemptFailed: boolean;
  paidAt: string | null;
  paymentReference: string | null;
  cancelReason: string | null;
}

const LINK_ATTEMPTS = { action: "checkout-link", limit: 3, windowMs: 10 * 60_000 };

/**
 * One customer's checkout for one of their own orders, or `null` if the
 * reference is not theirs.
 *
 * `createIfMissing` is for the page itself: a confirmed order with no usable
 * link gets one made on the spot. It is rate-limited per order, because a
 * ClickPesa outage plus a customer refreshing must not spend the account's
 * daily API allowance.
 */
export async function checkoutForCustomer(
  customerId: string,
  reference: string,
  { createIfMissing = false } = {},
): Promise<CheckoutView | null> {
  const db = getPrisma();
  const read = () =>
    db.order.findFirst({
      where: { reference, customerId },
      select: {
        id: true,
        reference: true,
        status: true,
        decisionNote: true,
        productName: true,
        quantity: true,
        unitPriceTZS: true,
        lineTotalTZS: true,
        quoteDeliveryFeeTZS: true,
        quoteOrderTotalTZS: true,
        branchName: true,
        branchCity: true,
        routeKind: true,
        routeCarrier: true,
        customerPhone: true,
        payments: {
          orderBy: { initiatedAt: "desc" },
          select: { status: true, checkoutLink: true, capturedAt: true, providerRef: true },
        },
      },
    });

  let order = await read();
  if (!order) return null;

  const captured = order.payments.find((p) => p.status === "captured") ?? null;
  const open = () => order?.payments.find((p) => p.status !== "captured" && p.checkoutLink) ?? null;

  if (createIfMissing && !captured && order.status === "confirmed" && !open()) {
    const limit = await checkRateLimit(`order:${order.id}`, LINK_ATTEMPTS);
    if (limit.allowed) {
      try {
        const made = await openCheckout(order.id);
        if (!made.ok && made.reason !== "unquotable") {
          await logServerError("checkout-open", new Error(`${order.reference}: ${made.reason}`), customerId);
        }
      } catch (error) {
        await logServerError("checkout-open", error, customerId);
      }
      order = (await read()) ?? order;
    }
  }

  const link = open();
  const state: CheckoutState = captured
    ? "paid"
    : order.status === "cancelled"
      ? "cancelled"
      : order.status === "pending"
        ? "waiting"
        : link
          ? "ready"
          : "unavailable";

  return {
    reference: order.reference,
    state,
    orderStatus: order.status,
    productName: order.productName,
    quantity: order.quantity,
    unitPriceTZS: order.unitPriceTZS,
    goodsTZS: order.lineTotalTZS,
    deliveryFeeTZS: order.quoteDeliveryFeeTZS ?? 0,
    totalTZS: order.quoteOrderTotalTZS,
    branchName: order.branchName,
    branchCity: order.branchCity,
    routeKind: order.routeKind,
    routeCarrier: order.routeCarrier,
    customerPhone: order.customerPhone,
    checkoutLink: state === "ready" ? (link?.checkoutLink ?? null) : null,
    lastAttemptFailed: state === "ready" && order.payments[0]?.status === "failed",
    paidAt: captured?.capturedAt?.toISOString() ?? null,
    paymentReference: captured?.providerRef ?? null,
    cancelReason: order.status === "cancelled" ? order.decisionNote : null,
  };
}

/** How long before the same payment may be checked with ClickPesa again from a customer's page. */
export const CUSTOMER_CHECK_EVERY_MS = 60_000;

/**
 * "I've paid" -- ask ClickPesa about this customer's open payment now, rather
 * than waiting for the webhook. At most once a minute per payment: the
 * account has 100 API calls a day until KYC, and a customer tapping the
 * button repeatedly must not be able to spend them.
 */
export async function checkPaymentForCustomer(customerId: string, reference: string): Promise<CheckoutView | null> {
  const db = getPrisma();
  const order = await db.order.findFirst({
    where: { reference, customerId },
    select: {
      payments: {
        where: { status: { not: "captured" } },
        orderBy: { initiatedAt: "desc" },
        take: 1,
        select: { id: true, lastCheckedAt: true },
      },
    },
  });
  if (!order) return null;

  const payment = order.payments[0];
  const due = payment && (!payment.lastCheckedAt || Date.now() - payment.lastCheckedAt.getTime() >= CUSTOMER_CHECK_EVERY_MS);
  if (payment && due) {
    try {
      await reconcilePayment(payment.id);
    } catch (error) {
      await logServerError("checkout-check", error, customerId);
    }
  }
  return checkoutForCustomer(customerId, reference);
}

/** Pay state per reference, for the list on the account page. One query. */
export async function checkoutStatesForCustomer(customerId: string): Promise<Map<string, "ready" | "paid" | "waiting">> {
  const orders = await getPrisma().order.findMany({
    where: { customerId, status: { in: ["pending", "confirmed", "fulfilled"] } },
    select: { reference: true, status: true, payments: { select: { status: true } } },
  });
  const states = new Map<string, "ready" | "paid" | "waiting">();
  for (const o of orders) {
    if (o.payments.some((p) => p.status === "captured")) states.set(o.reference, "paid");
    else if (o.status === "confirmed") states.set(o.reference, "ready");
    else if (o.status === "pending") states.set(o.reference, "waiting");
  }
  return states;
}
