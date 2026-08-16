"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/server/auth/dal";
import { isAdminConfigured } from "@/server/firebase/admin-config";
import type { SaveOrderRequestInput } from "@/server/orders/saved-requests";

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
 * `signed-out` without touching Firestore if it is called anyway.
 */

export type SaveResult =
  | { saved: true; reference: string }
  | { saved: false; reason: "signed-out" | "unavailable" | "rejected" | "quota" };

export async function saveOrderRequest(
  input: SaveOrderRequestInput
): Promise<SaveResult> {
  if (!isAdminConfigured()) return { saved: false, reason: "unavailable" };

  // The uid is taken from here and nowhere else. Whatever the payload claims
  // about who the customer is, this is the only answer the write path sees.
  const session = await verifySession();
  if (!session) return { saved: false, reason: "signed-out" };

  try {
    // Dynamic: this module reaches Firestore, so it is only worth loading once
    // a signed-in customer actually saves something.
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

    revalidatePath("/account");
    return { saved: true, reference: outcome.reference };
  } catch {
    // A Firestore outage must not cost the customer their order request: the
    // browser copy is already written by this point, so the flow continues and
    // the confirmation screen simply does not claim it was saved.
    return { saved: false, reason: "unavailable" };
  }
}
