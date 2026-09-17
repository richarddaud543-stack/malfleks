"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/server/auth/dal";
import { adminSession } from "@/server/auth/admin-session";
import { createOrder, type CreateOrderFailure } from "@/server/orders/create-order";
import { checkRateLimit, clientIp } from "@/server/rate-limit";
import type { TransitionBlocker } from "@/server/orders/status";
import type { SaveOrderRequestInput } from "@/server/orders/build-order-request";

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
  | { ok: true; reference: string }
  | { ok: false; reason: CreateOrderFailure | "unavailable" | "rate-limited" };

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

    const identity = session?.uid ? `uid:${session.uid}` : `ip:${await clientIp()}`;
    const limit = await checkRateLimit(identity, ORDER_RATE_LIMIT);
    if (!limit.allowed) return { ok: false, reason: "rate-limited" };

    const outcome = await createOrder(input, session?.uid ?? null);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // See `notifyOfOrder`: announced, never awaited for correctness. The
    // order is written; the customer's confirmation does not depend on an
    // email API being reachable.
    await notifyOfOrder(outcome.value.reference);

    return { ok: true, reference: outcome.value.reference };
  } catch {
    // The browser's own copy is already written by the time this runs (see
    // OrderRequestForm), so a failure here costs the customer nothing they
    // had a moment ago — they still reach the confirmation screen with a
    // reference they can quote.
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
 * **`markOrderFulfilled` now has a partner-facing sibling.** Since 6 Sep
 * 2026, the branch or courier actually fulfilling an order may mark it
 * `fulfilled` themselves — see `markOrderFulfilledByPartner` in `./status.ts`
 * and `src/app/actions/partner-orders.ts`. Every other transition here
 * (`confirmOrder`, `cancelOrder`) stays admin-only: this file's own boundary
 * is unchanged, the new one is a separate action with a separate trust check.
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

    revalidatePath("/admin/orders");
    return { ok: true };
  } catch {
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

    revalidatePath("/admin/orders");
    return { ok: true };
  } catch {
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

    revalidatePath("/admin/orders");
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Announce a new order request to MalFleks's own inbox.
 *
 * Its own try/catch, inside the caller's try, so that a mail failure can never
 * be mistaken for an order failure — the customer has a reference and the row
 * is committed by the time this runs.
 *
 * The email carries the reference and a link, not the customer's name, phone
 * number or address. Those live in `/admin/orders` behind a session; putting
 * them in an inbox copies personal data somewhere with a much longer memory
 * and much weaker access control, for no operational gain.
 */
async function notifyOfOrder(reference: string): Promise<void> {
  try {
    const { orderRequestMessage, sendNotification } = await import(
      "@/server/notify/email"
    );
    const { resolveSiteUrl } = await import("@/lib/site-url");
    const { subject, body } = orderRequestMessage({
      reference,
      siteUrl: resolveSiteUrl(),
    });
    await sendNotification(subject, body);
  } catch {
    // The order is saved. Nothing here is worth failing it for.
  }
}
