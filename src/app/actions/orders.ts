"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/server/auth/dal";
import { adminSession } from "@/server/auth/admin-session";
import { createOrder, type CreateOrderFailure } from "@/server/orders/create-order";
import { checkRateLimit, clientIp } from "@/server/rate-limit";
import { logServerError } from "@/server/error-log";
import type { TransitionBlocker } from "@/server/orders/status";
import { hasAdultConfirmation, hasDeliveryCity, type SaveOrderRequestInput } from "@/server/orders/build-order-request";
import {
  requestPaymentForOrder,
  type RequestPaymentFailure,
} from "@/server/orders/create-order-with-payment";

/**
 * Persisting an order request as a real backend record.
 *
 * `OrderRequestForm` calls this **only for a signed-in customer**, and the
 * guard is in the client on purpose — an action that declined to write would
 * still have received the name, phone number and address over the wire, and
 * "nothing is transmitted" has to mean no request at all. `e2e/auth.spec.ts`
 * asserts exactly that: zero same-origin POSTs on a signed-out submission.
 *
 * ## The reversal, and the reversal of the reversal
 *
 * This action briefly ran on every submission, signed in or not, so that every
 * request got a queryable record. Nobody updated the confirmation screen, so
 * the site kept telling signed-out customers their details had gone nowhere
 * while the server wrote them to Postgres. CI caught it on its first ever run
 * (2026-08-29) and the owner chose the honest side: a signed-out request stays
 * in the browser tab. Nothing is dispatched to a branch either way, so the
 * stored row bought an admin view of orders nobody acts on, in exchange for
 * holding a stranger's home address with no retention policy.
 *
 * `customerId` still comes from the verified session here, on the server —
 * never from the payload, and never from the client's own read of its session
 * state. The client decides *whether* to call; it does not get to say who it
 * is. A session that has expired between the page loading and the submit
 * simply writes nothing, which is the safe direction to fail.
 */

export type SubmitOrderResult =
  /** `payNow`: a checkout is open for this order, so the form goes straight to `/pay/[reference]`. */
  | { ok: true; reference: string; payNow: boolean }
  | { ok: false; reason: CreateOrderFailure | "unavailable" | "rate-limited" | "signed-out" };

// This is the one write action in this file with no session requirement at
// all (see the doc comment above), so it is the one place in the app that
// genuinely has no uid to key a rate limit by for a signed-out caller — see
// `clientIp`'s own doc comment for why that makes this limit deliberately
// loose rather than a precise per-person throttle. A signed-in customer still
// gets keyed by their own uid, which is the tight, meaningful limit.
const ORDER_RATE_LIMIT = { action: "submit-order", limit: 8, windowMs: 10 * 60_000 };

export async function submitOrder(
  input: SaveOrderRequestInput
): Promise<SubmitOrderResult> {
  try {
    const session = await verifySession();

    // An order needs an account: the payment is taken against it, and nothing
    // else can be confirmed, paid for or tracked. The form never calls this
    // signed out (it sends the customer to sign in instead), so a call with no
    // session is either a session that expired on the way or a hand-made
    // request -- and either way nothing is written. Until 4 Oct 2026 this
    // stored the name, phone and address with no owner, which is exactly what
    // the Terms say MalFleks does not do.
    if (!session?.uid) return { ok: false, reason: "signed-out" };

    // Where it is going has to be said; `createOrder` then holds the answer
    // to the branch's own city.
    if (!hasDeliveryCity(input)) return { ok: false, reason: "invalid" };
    // Ordering is for adults who accept the terms; the form asks, this holds it.
    if (!hasAdultConfirmation(input)) return { ok: false, reason: "invalid" };

    const identity = session?.uid ? `uid:${session.uid}` : `ip:${await clientIp()}`;
    const limit = await checkRateLimit(identity, ORDER_RATE_LIMIT);
    if (!limit.allowed) return { ok: false, reason: "rate-limited" };

    const outcome = await createOrder(input, session?.uid ?? null, session?.email ?? null);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // See `notifyOfOrder`: announced, never awaited for correctness. The
    // order is written; the customer's confirmation does not depend on an
    // email API being reachable. The branch is told only about a signed-in
    // customer's order -- that is the only kind the form sends here, and the
    // only kind that can be confirmed, paid for and tracked.
    //
    // A signed-in customer's order gets its checkout opened here and now, so
    // the next thing they see is the pay page -- not a wait for somebody to
    // confirm. Kept apart from the order itself: if ClickPesa is down or the
    // route cannot be priced, the order still stands and falls back to the
    // old path, where the branch is asked first.
    let payNow = false;
    if (session?.uid) {
      try {
        const { openCheckout } = await import("@/server/orders/checkout");
        const opened = await openCheckout(outcome.value.id, { notify: false });
        payNow = opened.ok;
        if (!opened.ok && opened.reason !== "unquotable") {
          await logServerError("checkout-open", new Error(`${outcome.value.reference}: ${opened.reason}`), session.uid);
        }
      } catch (error) {
        await logServerError("checkout-open", error, session.uid);
      }
    }

    // The branch is emailed now only when it has something to do now -- an
    // order waiting on its answer. One with a checkout open is waiting on the
    // customer; the branch hears about it when it is paid.
    await notifyOfOrder(outcome.value.reference, Boolean(session?.uid) && !payNow, payNow);

    return { ok: true, reference: outcome.value.reference, payNow };
  } catch (error) {
    // The browser's own copy is already written by the time this runs (see
    // OrderRequestForm), so a failure here costs the customer nothing they
    // had a moment ago — they still reach the confirmation screen with a
    // reference they can quote.
    await logServerError("submit-order", error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Moving an order through its status workflow — the admin half of order
 * management, added once the owner defined the vocabulary (see
 * `src/server/orders/status.ts`'s doc comment for the full table).
 *
 * Same shape as `src/app/actions/partner-review.ts`: **these actions check
 * admin themselves.** A Server Action is a public HTTP endpoint — the
 * `/admin/orders` page that renders the buttons is not a gate, and anyone
 * who knows an order id can call one of these directly. The failure
 * vocabulary is deliberately identical for "not an admin" and "no such
 * order": neither tells a caller anything about whether an order id exists.
 *
 * **These have partner-facing siblings.** Since 6 Sep 2026 the branch or
 * courier fulfilling an order may mark it `fulfilled` themselves, and since
 * 3 Oct 2026 the branch an order was sent to may confirm or decline it while
 * it is still `pending` — see `src/app/actions/partner-orders.ts`. The admin
 * keeps every power here; this file's own boundary is unchanged, and the
 * partner actions are separate endpoints with a separate trust check.
 *
 * After each transition commits, the people it concerns are told (see
 * `src/server/notify/events.ts`): the customer when an order is cancelled or
 * delivered, as well as the pay link they were already sent on confirmation.
 */

export type OrderTransitionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "forbidden" | "unavailable" | TransitionBlocker;
    };

// One shared guard: auth configured, right hostname, session, admin.
// See server/auth/admin-session.ts for why it lives in one place now.
const requireAdminSession = adminSession;

/** Admin verified with the branch that the product is available at the quoted price. */
export async function confirmOrder(orderId: string): Promise<OrderTransitionResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { confirmOrder: applyConfirm } = await import("@/server/orders/status");
    const outcome = await applyConfirm(orderId, session.uid);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // Confirming opens the checkout: the payment link is created now and the
    // customer is emailed where to pay (owner's call, 2 Oct 2026 -- no more
    // copying a link to them by hand). Kept out of the confirmation itself: a
    // ClickPesa outage must not un-confirm an order, and `/pay/[reference]`
    // creates the link on demand if this did not.
    try {
      const { openCheckout } = await import("@/server/orders/checkout");
      const opened = await openCheckout(orderId);
      if (!opened.ok && opened.reason !== "unquotable") {
        await logServerError("checkout-open", new Error(`${orderId}: ${opened.reason}`), session.uid);
      }
    } catch (error) {
      await logServerError("checkout-open", error, session.uid);
    }

    revalidatePath("/admin/orders", "layout");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    await logServerError("confirm-order", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

/** Won't be fulfilled. `reason` is stored with the decision, same as a rejected application. */
export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<OrderTransitionResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { cancelOrder: applyCancel } = await import("@/server/orders/status");
    const outcome = await applyCancel(orderId, session.uid, reason);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // Committed, and only this call moved it: tell the customer, saying
    // whether they were charged. Never throws.
    const { notifyOrderCancelled } = await import("@/server/notify/events");
    await notifyOrderCancelled(orderId);

    revalidatePath("/admin/orders", "layout");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    await logServerError("cancel-order", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

/** Delivered / handed off. Terminal. */
export async function markOrderFulfilled(
  orderId: string
): Promise<OrderTransitionResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { markOrderFulfilled: applyFulfil } = await import("@/server/orders/status");
    const outcome = await applyFulfil(orderId, session.uid);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // Committed, and only this call moved it: thank the customer. Never throws.
    const { notifyOrderDelivered } = await import("@/server/notify/events");
    await notifyOrderDelivered(orderId);

    // Delivered and split: pay the partner now, if automatic payouts are on.
    // After the response; never throws and cannot undo the delivery.
    const { afterResponse } = await import("@/server/after-response");
    await afterResponse(async () => {
      const { runAutoPayouts } = await import("@/server/money/auto-payouts");
      await runAutoPayouts();
    });

    revalidatePath("/admin/orders", "layout");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    await logServerError("mark-order-fulfilled", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Admin clicks "Send payment link" on an order already `confirmed` --
 * generates (or reuses) a ClickPesa hosted-checkout URL for the full
 * `quoteOrderTotalTZS`, and hands it back for the admin to copy and send
 * themselves. See `requestPaymentForOrder`'s own doc comment in
 * `create-order-with-payment.ts` for exactly what this does and, just as
 * importantly, what it deliberately does not do: it never moves
 * `Order.status`, and it is not reachable from anywhere a signed-out
 * customer or the order-submission flow could trigger it.
 */
export type SendPaymentLinkResult =
  | { ok: true; checkoutLink: string; reused: boolean }
  | { ok: false; reason: "forbidden" | "unavailable" | RequestPaymentFailure };

export async function sendPaymentLink(
  orderId: string
): Promise<SendPaymentLinkResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const outcome = await requestPaymentForOrder(orderId);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    return { ok: true, checkoutLink: outcome.checkoutLink, reused: outcome.reused };
  } catch (error) {
    await logServerError("send-payment-link", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Announce a new order request: to MalFleks's own inbox, and to the branch it
 * was sent to.
 *
 * Its own try/catch, inside the caller's try, so that a mail failure can never
 * be mistaken for an order failure — the customer has a reference and the row
 * is committed by the time this runs. `notifyOfNewOrder` already swallows its
 * own failures; this is the second belt.
 *
 * Neither email carries the customer's name, phone number or address. Those
 * live in `/admin/orders` and `/partner/orders` behind a session; putting them
 * in an inbox copies personal data somewhere with a much longer memory and
 * much weaker access control, for no operational gain.
 */
async function notifyOfOrder(reference: string, tellBranch: boolean, awaitingPayment = false): Promise<void> {
  try {
    const { notifyOfNewOrder } = await import("@/server/notify/events");
    await notifyOfNewOrder(reference, { tellBranch, awaitingPayment });
  } catch (error) {
    // The order is saved. Nothing here is worth failing it for — but a
    // Brevo outage is exactly what the launch checklist's "unproven" flag on
    // notifications is waiting to catch, so it goes in the log rather than
    // vanishing silently.
    await logServerError("notify-of-order", error);
  }
}
