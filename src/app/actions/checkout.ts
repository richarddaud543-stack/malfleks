"use server";

import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import type { CheckoutView } from "@/server/orders/checkout";

/**
 * The checkout page's two questions, both about the signed-in customer's own
 * order and nobody else's: "what is its state now?" (a database read, polled
 * while the page is open) and "I've paid -- check" (asks ClickPesa, at most
 * once a minute per payment).
 *
 * `null` covers signed-out, not-yours and not-found alike, deliberately: the
 * page cannot tell them apart and neither should a caller probing references.
 */
export async function checkoutStatusAction(reference: string): Promise<CheckoutView | null> {
  const session = await verifySession();
  if (!session || typeof reference !== "string") return null;
  try {
    const { checkoutForCustomer } = await import("@/server/orders/checkout");
    return await checkoutForCustomer(session.uid, reference);
  } catch (error) {
    await logServerError("checkout-status", error, session.uid);
    return null;
  }
}

export async function checkPaymentNowAction(reference: string): Promise<CheckoutView | null> {
  const session = await verifySession();
  if (!session || typeof reference !== "string") return null;
  try {
    const { checkPaymentForCustomer } = await import("@/server/orders/checkout");
    return await checkPaymentForCustomer(session.uid, reference);
  } catch (error) {
    await logServerError("checkout-check", error, session.uid);
    return null;
  }
}
