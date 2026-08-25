"use server";

import { verifySession } from "@/server/auth/dal";
import { createOrder, type CreateOrderFailure } from "@/server/orders/create-order";
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
