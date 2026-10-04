"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";

/**
 * What a signed-in customer may do to their own order.
 *
 * Its own file for the same reason `partner-orders.ts` is: each file of
 * actions shares one trust check, and this one's is "the session's own uid,
 * and only orders that carry it". `reference` says which order; it says
 * nothing about whose, and `cancelOrderAsCustomer` puts the uid in the query.
 */

export type CancelOwnOrderResult =
  | { ok: true; kind: "cancelled" | "requested" }
  | { ok: false; reason: "signed-out" | "unavailable" | "not-found" | "too-late" | "already-asked" };

export async function cancelOwnOrderAction(reference: string): Promise<CancelOwnOrderResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { cancelOrderAsCustomer } = await import("@/server/orders/customer-cancel");
    const outcome = await cancelOrderAsCustomer(session.uid, String(reference));
    if (!outcome.ok) return outcome;

    if (outcome.kind === "cancelled") {
      revalidatePath("/account");
      revalidatePath("/partner/orders");
      revalidatePath("/admin/orders", "layout");
      revalidatePath("/admin");
    }
    return outcome;
  } catch (error) {
    await logServerError("cancel-own-order", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
