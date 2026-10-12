"use server";

import { revalidateSitePath } from "@/server/revalidate-site";
import { verifySession } from "@/server/auth/dal";
import { isAuthConfigured } from "@/server/auth/config";
import { checkRateLimit } from "@/server/rate-limit";
import { logServerError } from "@/server/error-log";
import type { SaveOrderRequestInput } from "@/server/orders/saved-requests";
import { hasAdultConfirmation, hasDeliveryCity } from "@/server/orders/build-order-request";

// Signed in only (see below), so the uid is always available — a tighter,
// meaningful limit than the IP-based backstop `submitOrder` needs.
const SAVE_REQUEST_RATE_LIMIT = {
  action: "save-order-request",
  limit: 20,
  windowMs: 60 * 60_000,
};

/**
 * Saving an order request to a signed-in customer's account.
 *
 * This is an **addition**, never a gate. A signed-out customer's order request
 * is built in the browser, put in `sessionStorage` and shown back to them —
 * exactly as before this existed, and with nothing transmitted anywhere. The
 * client only calls this action once it already knows a session exists, so a
 * signed-out customer's name, phone and address never leave the device.
 *
 * That is enforced twice: the caller checks first, and this action returns
 * `signed-out` without touching the database if it is called anyway.
 */

export type SaveResult =
  | { saved: true; reference: string }
  | {
      saved: false;
      reason: "signed-out" | "unavailable" | "rejected" | "quota" | "rate-limited";
    };

export async function saveOrderRequest(
  input: SaveOrderRequestInput
): Promise<SaveResult> {
  if (!isAuthConfigured()) return { saved: false, reason: "unavailable" };

  // The uid is taken from here and nowhere else. Whatever the payload claims
  // about who the customer is, this is the only answer the write path sees.
  const session = await verifySession();
  if (!session) return { saved: false, reason: "signed-out" };

  const limit = await checkRateLimit(session.uid, SAVE_REQUEST_RATE_LIMIT);
  if (!limit.allowed) return { saved: false, reason: "rate-limited" };

  // Same rule as `submitOrder`: the request has to say where it is going.
  if (!hasDeliveryCity(input)) return { saved: false, reason: "rejected" };
  if (!hasAdultConfirmation(input)) return { saved: false, reason: "rejected" };

  try {
    // Dynamic: this module reaches the database, so it is only worth loading
    // once a signed-in customer actually saves something.
    const { saveOrderRequestForCustomer } = await import(
      "@/server/orders/saved-requests"
    );
    const outcome = await saveOrderRequestForCustomer(session.uid, input);
    if (!outcome.saved) {
      return {
        saved: false,
        reason: outcome.reason === "quota" ? "quota" : "rejected",
      };
    }

    revalidateSitePath("/account");
    return { saved: true, reference: outcome.reference };
  } catch (error) {
    // A database outage must not cost the customer their order request: the
    // browser copy is already written by this point, so the flow continues and
    // the confirmation screen simply does not claim it was saved.
    await logServerError("save-order-request", error, session.uid);
    return { saved: false, reason: "unavailable" };
  }
}

export type DeleteResult =
  | { deleted: true }
  | {
      deleted: false;
      reason: "signed-out" | "unavailable" | "invalid-id" | "not-found" | "order-in-progress";
    };

/**
 * Removing a saved order request.
 *
 * This is the counterpart the save path shipped without, and the gap was the
 * point of debt #20: a customer could put their name, phone number and home
 * address into storage and had no way to take them back out. Deletion goes
 * through this action, server-side, exactly as the write does — the browser
 * never talks to the database directly.
 *
 * The id is the only thing the browser supplies, and it decides nothing:
 * `deleteOrderRequestForCustomer` scopes the delete by the session's own
 * `customerId`, so a forged id belonging to another customer matches no rows
 * and reads as not-found. Under Firestore this needed a format check as well,
 * because an id could be a *path* — that hazard is gone.
 *
 * **One thing it refuses:** removing the saved copy of an order that is
 * confirmed and unpaid, or paid and not yet delivered (`order-in-progress`).
 * The card on `/account` is the customer's only way back to that order's Pay
 * and Track pages, and removing it would not cancel the order — it would only
 * hide it from the one person who is about to pay for it or is waiting on it.
 * The button is not offered in that state; this is the check that holds when
 * the action is called anyway. Once the order is delivered or cancelled, or
 * while it is still waiting on the branch, the copy can be removed as before.
 */
export async function deleteOrderRequest(id: string): Promise<DeleteResult> {
  if (!isAuthConfigured()) return { deleted: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { deleted: false, reason: "signed-out" };

  try {
    const { deleteOrderRequestForCustomer, savedRequestReference } = await import(
      "@/server/orders/saved-requests"
    );

    const reference = await savedRequestReference(session.uid, id);
    if (reference) {
      const { savedCopyMustStay } = await import("@/server/orders/checkout");
      if (await savedCopyMustStay(session.uid, reference)) {
        return { deleted: false, reason: "order-in-progress" };
      }
    }

    const outcome = await deleteOrderRequestForCustomer(session.uid, id);
    if (!outcome.deleted) return { deleted: false, reason: outcome.reason };

    revalidateSitePath("/account");
    return { deleted: true };
  } catch (error) {
    // Unlike the save path, there is no local copy to fall back on: the
    // customer asked for something to be gone and it is not gone. Say so.
    await logServerError("delete-order-request", error, session.uid);
    return { deleted: false, reason: "unavailable" };
  }
}
