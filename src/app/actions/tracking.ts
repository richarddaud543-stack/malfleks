"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";

/**
 * Delivery tracking's two Server Action entry points: a partner reporting
 * where they are, and a customer polling for the newest report.
 *
 * Same trust boundary as `partner-products.ts` and `order-requests.ts`: a
 * Server Action is a public HTTP endpoint on its own, so every action here
 * re-verifies the session and re-resolves identity from it — never from an
 * argument — even though the pages that render these controls already gate on
 * the same session.
 */

export type PostDeliveryPingResult =
  | {
      ok: true;
      ping: { id: string; latitude: number; longitude: number; note: string | null; createdAt: string };
    }
  | {
      ok: false;
      reason:
        | "signed-out"
        | "unavailable"
        | "not-a-partner"
        | "not-found"
        | "not-trackable"
        | "invalid-location";
    };

/**
 * A partner (the branch or courier fulfilling this order) reports their
 * current position.
 *
 * `orderId` is the only thing the browser supplies about *which* order — it
 * decides nothing about *whose*. `postDeliveryPing` resolves the caller's
 * `branchId`/`agentId` from `partnerForUser(session.uid)` and puts that in the
 * query's `WHERE`, so an `orderId` copied from another branch's tab matches no
 * rows and reads as `not-found`, the same way `submitProduct` already treats a
 * `branchId` it did not derive itself.
 */
export async function postDeliveryPingAction(
  orderId: string,
  input: { latitude: number; longitude: number; note?: string },
): Promise<PostDeliveryPingResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { partnerForUser } = await import("@/server/partners/portal");
    const partner = await partnerForUser(session.uid);
    if (!partner) return { ok: false, reason: "not-a-partner" };

    const { postDeliveryPing } = await import("@/server/orders/tracking");
    const outcome = await postDeliveryPing(
      orderId,
      { branchId: partner.branchId, agentId: partner.agentId },
      input,
    );
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidatePath("/partner/orders");
    return { ok: true, ping: outcome.ping };
  } catch {
    // Opaque on purpose, matching listProductForPartner: the reason a write
    // failed is not the caller's business and may name internals.
    return { ok: false, reason: "unavailable" };
  }
}

export interface TrackedOrderSummary {
  status: string;
  reference: string;
  productName: string;
  quantity: number;
  branchName: string;
  branchCity: string;
  routeKind: string;
  routeCarrier: string;
  pings: {
    id: string;
    latitude: number;
    longitude: number;
    note: string | null;
    createdAt: string;
  }[];
}

export type FetchCustomerTrackingResult =
  | { ok: true; order: TrackedOrderSummary }
  | { ok: false; reason: "signed-out" | "unavailable" | "not-found" };

/**
 * A signed-in customer's own tracking view for one order, by its reference.
 *
 * This is the only path a customer has into this data: `reference` is what
 * `/order/confirmation` and every saved-request card already show them, and
 * `trackedOrderForCustomer` puts `customerId` from the session in the query's
 * `WHERE`, so a reference belonging to someone else's order — findable in
 * principle, since it is a short spoken-aloud code and not a secret — matches
 * zero rows and reads as `not-found`, never confirming the order exists.
 *
 * Called on an interval by `LiveTrackingPanel`, so it deliberately does no
 * heavier a query than `trackedOrderForCustomer` already runs — polling every
 * ~20s is cheap only if each call stays cheap.
 */
export async function fetchCustomerTrackingAction(
  reference: string,
): Promise<FetchCustomerTrackingResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { trackedOrderForCustomer } = await import(
      "@/server/orders/tracking"
    );
    const order = await trackedOrderForCustomer(session.uid, reference);
    if (!order) return { ok: false, reason: "not-found" };

    // Trimmed to what the panel renders — `id` and `createdAt` are for the
    // server module's own callers, not this wire shape.
    return {
      ok: true,
      order: {
        status: order.status,
        reference: order.reference,
        productName: order.productName,
        quantity: order.quantity,
        branchName: order.branchName,
        branchCity: order.branchCity,
        routeKind: order.routeKind,
        routeCarrier: order.routeCarrier,
        pings: order.pings,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
