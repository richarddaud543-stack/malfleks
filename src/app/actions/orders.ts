"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/server/auth/dal";
import { isAdminUser } from "@/server/auth/admin";
import { isAdminConfigured } from "@/server/firebase/admin-config";
import { createOrder, type CreateOrderFailure } from "@/server/orders/create-order";
import type { TransitionBlocker } from "@/server/orders/status";
import type { SaveOrderRequestInput } from "@/server/orders/build-order-request";

/**
 * Persisting an order request as a real backend record.
 *
 * This is the action `OrderRequestForm` now calls on **every** submission —
 * signed in or not. That is a deliberate reversal of the property this flow
 * used to guarantee ("a signed-out customer's request is transmitted
 * nowhere"): the owner decided every order request gets a real, queryable
 * record instead. See `docs/backend.md`'s third Decision block.
 *
 * `customerId` comes from the verified session cookie here, on the server —
 * never from the payload, and never from the client's own read of its
 * session state. A signed-out customer gets `customerId: null`, not a
 * rejected write.
 *
 * This does not gate on `isAdminConfigured()` the way `saveOrderRequest`
 * (`./order-requests.ts`) does — that check exists because *that* action
 * touches Firestore via the Admin SDK. This one only touches Prisma, so a
 * misconfigured Firebase project should not stop an order from being
 * recorded; it should only stop `verifySession()` from finding anyone
 * signed in, which it already handles by returning `null`.
 */

export type SubmitOrderResult =
  | { ok: true; reference: string }
  | { ok: false; reason: CreateOrderFailure | "unavailable" };

export async function submitOrder(
  input: SaveOrderRequestInput
): Promise<SubmitOrderResult> {
  try {
    const session = await verifySession();
    const outcome = await createOrder(input, session?.uid ?? null);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

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
 * There is no partner-facing equivalent of any of this, and none is faked
 * here — `Partner`/`PartnerUser` records are not linked to "their" orders
 * anywhere in this codebase.
 */

export type OrderTransitionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "forbidden" | "unavailable" | TransitionBlocker;
    };

async function requireAdminSession() {
  if (!isAdminConfigured()) return null;
  const session = await verifySession();
  if (!session || !isAdminUser(session)) return null;
  return session;
}

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
