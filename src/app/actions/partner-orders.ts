"use server";

import { revalidateSitePath } from "@/server/revalidate-site";
import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import type { TransitionBlocker } from "@/server/orders/status";

/**
 * The order-status transitions a partner may make themselves.
 *
 * **Marking their own delivery `fulfilled`** — the owner's call on 6 Sep 2026.
 * "Did this delivery actually happen" is something the partner is the one
 * person who genuinely knows, and an admin marking it from a phone call is
 * transcription of what the partner already told them.
 *
 * **Answering a `pending` order sent to their branch** — the owner's call on
 * 3 Oct 2026: confirm it, or decline it with a reason. See
 * `src/server/orders/branch-decisions.ts` for who may and how that is proved.
 * Cancelling an order that is already `confirmed` stays admin-only: by then
 * the customer may have paid, and backing out is a refund decision.
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
      reason:
        | "signed-out"
        | "unavailable"
        | "not-a-partner"
        | "not-paid"
        | TransitionBlocker;
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

    // After the commit, and only for the call that actually moved the order:
    // thank the customer and leave them the delivery record. Never throws.
    const { notifyOrderDelivered } = await import("@/server/notify/events");
    await notifyOrderDelivered(orderId);

    revalidateSitePath("/partner/orders");
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

export type BranchDecisionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "signed-out"
        | "unavailable"
        | "not-a-partner"
        | "partner-suspended"
        | "reason-required"
        | TransitionBlocker;
    };

/** Both decisions change what three different people see. */
function revalidateAfterDecision() {
  revalidateSitePath("/partner/orders");
  revalidatePath("/admin/orders", "layout");
  revalidatePath("/admin");
  revalidateSitePath("/account");
}

/**
 * "Confirm — we have it at this price", pressed by the branch on a pending
 * order.
 *
 * `orderId` says which order and nothing about whose. The session's uid is
 * the only identity `confirmOrderAsBranch` is given, and it proves from the
 * database that this uid manages the active partner owning the order's branch
 * before anything moves. Someone else's order id reads as `not-found`.
 *
 * Confirming opens the customer's checkout and emails them the pay link, the
 * same as an admin confirming does.
 */
export async function confirmOrderByBranchAction(
  orderId: string,
): Promise<BranchDecisionResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { confirmOrderAsBranch } = await import(
      "@/server/orders/branch-decisions"
    );
    const outcome = await confirmOrderAsBranch(session.uid, String(orderId));
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidateAfterDecision();
    return { ok: true };
  } catch (error) {
    await logServerError("confirm-order-by-branch", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * "Can't fulfil", pressed by the branch on a pending order, with a reason.
 *
 * Same ownership proof as the confirm above. The reason is required here as
 * well as in the form — it is stored with the decision and emailed to the
 * customer, and a Server Action can be called without the form.
 */
export async function declineOrderByBranchAction(
  orderId: string,
  reason: string,
): Promise<BranchDecisionResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { declineOrderAsBranch } = await import(
      "@/server/orders/branch-decisions"
    );
    const outcome = await declineOrderAsBranch(
      session.uid,
      String(orderId),
      typeof reason === "string" ? reason : "",
    );
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidateAfterDecision();
    return { ok: true };
  } catch (error) {
    await logServerError("decline-order-by-branch", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
