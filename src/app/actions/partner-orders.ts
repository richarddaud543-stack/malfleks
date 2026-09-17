"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import type { TransitionBlocker } from "@/server/orders/status";

/**
 * The one order-status transition a partner may make themselves: marking
 * their own delivery `fulfilled`.
 *
 * The owner's call on 6 Sep 2026, scoped deliberately narrow: `confirmed`
 * still means MalFleks admin rang the branch and verified stock and price, and
 * `cancelled` stays admin-only, since a cancellation is the one transition an
 * interested party has a reason to misreport. "Did this delivery actually
 * happen" has the opposite shape — the partner is the one person who
 * genuinely knows, and an admin marking it from a phone call is transcription
 * of what the partner already told them, not independent verification.
 *
 * Kept in its own file rather than added to `src/app/actions/orders.ts`:
 * that file's actions all share one admin trust check
 * (`adminSession`/`requireAdminSession`); this one shares the partner trust
 * check every other `/partner` action uses instead. Mixing the two boundaries
 * in one file is how a future edit ends up applying the wrong one.
 */

export type MarkFulfilledResult =
  | { ok: true }
  | {
      ok: false;
      reason: "signed-out" | "unavailable" | "not-a-partner" | TransitionBlocker;
    };

/**
 * `orderId` is the only thing the caller supplies about *which* order — it
 * decides nothing about *whose*. `markOrderFulfilledByPartner` resolves the
 * caller's own `branchId`/`agentId` from `partnerForUser(session.uid)` and
 * puts that in the query's `WHERE`, so an id copied from another branch's tab
 * matches no rows and reads as `not-found`, the same boundary
 * `postDeliveryPingAction` already holds for the same reason.
 */
export async function markOrderFulfilledByPartnerAction(
  orderId: string,
): Promise<MarkFulfilledResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { partnerForUser } = await import("@/server/partners/portal");
    const partner = await partnerForUser(session.uid);
    if (!partner) return { ok: false, reason: "not-a-partner" };

    const { markOrderFulfilledByPartner } = await import(
      "@/server/orders/status"
    );
    const outcome = await markOrderFulfilledByPartner(
      orderId,
      { branchId: partner.branchId, agentId: partner.agentId },
      session.uid,
    );
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidatePath("/partner/orders");
    // The admin queue shows the same order and the same status.
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (error) {
    // Opaque on purpose, matching every other action in this codebase: the
    // reason a write failed is not the caller's business and may name
    // internals.
    await logServerError("mark-order-fulfilled-by-partner", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
