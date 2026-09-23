import { getPrisma } from "@/server/db/client";
import { resolveSiteUrl } from "@/lib/site-url";
import { generateCheckoutLink } from "@/server/payments/clickpesa";
import { logServerError } from "@/server/error-log";
import { createOrder, type CreateOrderFailure } from "./create-order";
import type { SaveOrderRequestInput } from "./build-order-request";

/**
 * Two ways a ClickPesa checkout link gets created for an order -- both built
 * 19 Sep 2026, per malfleks-escrow-ledger-design.md, and both careful not to
 * touch the same two invariants: `Order.status = "confirmed"` still means
 * only "the branch verified availability and price" (see
 * `src/server/orders/status.ts`'s own doc comment -- "Still no money has
 * moved" -- and the matching line in `docs/backend.md`), and
 * `OrderRequestForm`'s literal, load-bearing promise to the customer: "No
 * payment is taken here." Neither function below is called from anywhere
 * that would make either of those sentences false.
 *
 *  - `initiateEscrowCheckout` -- Decision 2, Option A of the design doc:
 *    would create the `Order` row and the checkout link in the same breath,
 *    at submission time. **Not wired into `submitOrder`/`OrderRequestForm`
 *    -- still not.** Doing that means resolving how a signed-out customer
 *    pays (today `OrderRequestForm` sends nothing to the server at all for
 *    one -- see that file's own long comment on the 2026-08-29 CI-caught
 *    incident), *and* it would mean asking for money before the branch has
 *    confirmed anything is actually available, which is the opposite of
 *    what `OrderRequestForm` currently promises. Kept here, unwired, as
 *    ready plumbing for whichever way the owner decides that.
 *
 *  - `requestPaymentForOrder` -- the safe, additive one, built on the
 *    owner's 19 Sep go-ahead to finish what's buildable without deciding
 *    the above. An **admin**, from `/admin/orders`, explicitly clicks "Send
 *    payment link" on an order **already `confirmed`** -- branch already
 *    verified stock and price by phone, exactly the moment `OrderCard`'s
 *    own copy says nothing has been charged *yet*. This generates a link
 *    the admin copies and sends themselves (SMS, WhatsApp, however they
 *    already reach the customer) -- nothing here sends it automatically,
 *    and nothing here moves `Order.status`. Paying or not paying has no
 *    effect on `markOrderFulfilled` unless/until the owner asks for that.
 *
 * Both block an unquotable order (`quoteOrderTotalTZS == null` -- every
 * city, as of 2026-09-19, since no delivery fee is set yet) the same way:
 * there is no honest total to charge. `createOrder` itself still allows an
 * unquotable order through for every other, non-payment caller.
 */

export type InitiateEscrowCheckoutFailure =
  | CreateOrderFailure
  | "unquotable"
  | "checkout-link-failed";

export type InitiateEscrowCheckoutOutcome =
  | { ok: true; reference: string; checkoutLink: string }
  | { ok: false; reason: InitiateEscrowCheckoutFailure };

/**
 * ClickPesa rejects any `orderReference` that is not purely alphanumeric --
 * `400 Invalid Order Reference, should only contain alphanumeric characters`,
 * per its generate-checkout-link API reference. Every MalFleks reference is
 * `BRAND-CITY-CODE` (ORA-DOD-N6CD), so every one of them was rejected and no
 * order could ever be sent a payment link. Confirmed live 23 Sep 2026.
 *
 * The stripped form is what gets STORED as `OrderPayment.providerRef`, not
 * merely what gets sent. The webhook in
 * `src/app/api/payments/clickpesa/route.ts` looks a payment up by
 * `providerRef` against the `orderReference` ClickPesa echoes back, so if the
 * two ever diverge a customer pays, the lookup finds nothing, and the money
 * is collected with nothing recorded against it. Same string to ClickPesa and
 * to the database, on every path, always.
 */
export function toClickPesaReference(reference: string): string {
  return reference.replace(/[^a-zA-Z0-9]/g, "");
}

export async function initiateEscrowCheckout(
  input: SaveOrderRequestInput,
  customerId: string | null,
): Promise<InitiateEscrowCheckoutOutcome> {
  const created = await createOrder(input, customerId);
  if (!created.ok) return { ok: false, reason: created.reason };

  const db = getPrisma();
  const order = await db.order.findUnique({
    where: { id: created.value.id },
    select: {
      id: true,
      reference: true,
      quoteOrderTotalTZS: true,
      customerFullName: true,
      customerPhone: true,
    },
  });

  // Can only be missing if it was deleted in the instant between the write
  // above and this read -- nothing in this codebase deletes an Order, so
  // this is defensive, not expected to fire.
  if (!order || order.quoteOrderTotalTZS == null) {
    return { ok: false, reason: "unquotable" };
  }

  // `providerRef` starts as `order.reference` (our own, already-unique id)
  // rather than ClickPesa's `paymentReference`, because ClickPesa does not
  // hand back a `paymentReference` at link-generation time -- only once a
  // payment attempt actually happens, which is what the webhook in
  // src/app/api/payments/clickpesa/route.ts reports. `providerRef` is
  // NOT NULL and @unique from the moment this row is created, so it needs a
  // real value now; the webhook overwrites it with ClickPesa's own
  // paymentReference the moment a payment captures, guarded the same way
  // `writeTransition` guards `Order.status` -- see that route for the match.
  //
  // `orderReference` sent to ClickPesa is `order.reference` stripped to
  // alphanumerics (see `toClickPesaReference`) -- this is always an order's
  // *first* payment attempt (a fresh `Order` just got created above), so it
  // matches `requestPaymentForOrder`'s own first-attempt convention below, and the webhook route
  // (`src/app/api/payments/clickpesa/route.ts`) matches by
  // `OrderPayment.providerRef`, whichever convention produced it.
  const providerRef = toClickPesaReference(order.reference);

  const checkout = await generateCheckoutLink({
    orderReference: providerRef,
    totalPriceTZS: order.quoteOrderTotalTZS,
    customerName: order.customerFullName,
    customerPhone: order.customerPhone,
    callbackUrl: `${resolveSiteUrl()}/api/payments/clickpesa`,
  });

  if (!checkout.ok) {
    await logServerError(
      "clickpesa-checkout-link",
      new Error(`${checkout.reason}: ${checkout.detail ?? "no detail given"}`),
    );
    return { ok: false, reason: "checkout-link-failed" };
  }

  await db.orderPayment.create({
    data: {
      orderId: order.id,
      providerRef,
      provider: "clickpesa",
      amountTZS: order.quoteOrderTotalTZS,
      checkoutLink: checkout.checkoutLink,
      status: "pending",
    },
  });

  return { ok: true, reference: order.reference, checkoutLink: checkout.checkoutLink };
}

export type RequestPaymentFailure =
  | "not-found"
  | "wrong-status"
  | "unquotable"
  | "already-paid"
  | "checkout-link-failed";

export type RequestPaymentOutcome =
  | { ok: true; checkoutLink: string; reused: boolean }
  | { ok: false; reason: RequestPaymentFailure };

/**
 * Admin-triggered: generate (or, if one already exists, hand back) a
 * ClickPesa checkout link for an order already sitting at `confirmed`.
 *
 * Caller (`sendPaymentLink` in `src/app/actions/orders.ts`) is responsible
 * for the admin-session check -- this function trusts `orderId` the way
 * every other function in this module trusts its caller for identity, and
 * does no auth itself.
 *
 * A second call against the same order is a safe, cheap no-op that reuses
 * the stored link rather than calling ClickPesa again: `providerRef` is
 * pinned to `order.reference`, ClickPesa 409s on a repeat `orderReference`,
 * and the pre-KYC account has a 100 calls/day ceiling worth not spending on
 * "admin reloaded the page."
 */
export async function requestPaymentForOrder(
  orderId: string,
): Promise<RequestPaymentOutcome> {
  const db = getPrisma();
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      reference: true,
      quoteOrderTotalTZS: true,
      customerFullName: true,
      customerPhone: true,
    },
  });
  if (!order) return { ok: false, reason: "not-found" };
  if (order.status !== "confirmed") return { ok: false, reason: "wrong-status" };

  const attempts: { status: string; checkoutLink: string | null }[] =
    await db.orderPayment.findMany({
      where: { orderId: order.id },
      orderBy: { initiatedAt: "desc" },
      select: { status: true, checkoutLink: true },
    });
  if (attempts.some((a: { status: string }) => a.status === "captured")) {
    return { ok: false, reason: "already-paid" };
  }
  const latestPending = attempts.find(
    (a: { status: string }) => a.status === "pending",
  );
  if (latestPending?.checkoutLink) {
    return { ok: true, checkoutLink: latestPending.checkoutLink, reused: true };
  }

  if (order.quoteOrderTotalTZS == null) {
    return { ok: false, reason: "unquotable" };
  }

  // The webhook route matches by `OrderPayment.providerRef`, not
  // `Order.reference` -- see that route's own doc comment (rule 4). The
  // first attempt uses the stripped `order.reference`, same as
  // `initiateEscrowCheckout`; every attempt after a `failed` one gets a
  // suffix, since ClickPesa 409s on a repeated `orderReference` and
  // `providerRef` is `@unique` in the schema.
  const base = toClickPesaReference(order.reference);
  const providerRef =
    attempts.length === 0 ? base : `${base}P${attempts.length + 1}`;

  const checkout = await generateCheckoutLink({
    orderReference: providerRef,
    totalPriceTZS: order.quoteOrderTotalTZS,
    customerName: order.customerFullName,
    customerPhone: order.customerPhone,
    callbackUrl: `${resolveSiteUrl()}/api/payments/clickpesa`,
  });
  if (!checkout.ok) {
    await logServerError(
      "clickpesa-checkout-link",
      new Error(`${checkout.reason}: ${checkout.detail ?? "no detail given"}`),
    );
    return { ok: false, reason: "checkout-link-failed" };
  }

  await db.orderPayment.create({
    data: {
      orderId: order.id,
      providerRef,
      provider: "clickpesa",
      amountTZS: order.quoteOrderTotalTZS,
      checkoutLink: checkout.checkoutLink,
      status: "pending",
    },
  });

  return { ok: true, checkoutLink: checkout.checkoutLink, reused: false };
}
