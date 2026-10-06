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
 * **Confirming their own delivery** — the owner's call on 6 Sep 2026 that the
 * partner does this themselves, and on 5 Oct 2026 that they do it by entering
 * the delivery code the customer holds, so that the step which makes a
 * partner payable is confirmed by the person who received the goods.
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

export type ConfirmDeliveryResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "signed-out"
        | "unavailable"
        | "not-a-partner"
        | "not-paid"
        | "bad-code"
        | "locked-admin"
        | TransitionBlocker;
    }
  | { ok: false; reason: "wrong-code"; triesLeft: number; lockedUntil: string | null; adminOnly: boolean }
  | { ok: false; reason: "locked"; lockedUntil: string };

/**
 * The branch or courier enters the delivery code the customer just told them.
 * A matching code is the only way a partner can mark an order delivered (the
 * owner's call, 5 Oct 2026) -- see `src/server/orders/delivery-code.ts`.
 *
 * `orderId` is the only thing the caller supplies about *which* order — it
 * decides nothing about *whose*. `confirmDeliveryWithCode` resolves the
 * caller's own `branchId`/`agentId` from `partnerForUser(session.uid)` and
 * puts that in the query's `WHERE`, so an id copied from another branch's tab
 * matches no rows and reads as `not-found`, the same boundary
 * `postDeliveryPingAction` already holds for the same reason.
 */
export async function confirmDeliveryWithCodeAction(
  orderId: string,
  code: string,
): Promise<ConfirmDeliveryResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { partnerForUser } = await import("@/server/partners/portal");
    const partner = await partnerForUser(session.uid);
    if (!partner) return { ok: false, reason: "not-a-partner" };

    const { confirmDeliveryWithCode } = await import("@/server/orders/delivery-code");
    const outcome = await confirmDeliveryWithCode(
      String(orderId),
      { branchId: partner.branchId, agentId: partner.agentId },
      session.uid,
      code,
    );
    if (!outcome.ok) {
      // The fifteenth wrong code: only MalFleks can settle it now, so
      // MalFleks is told -- once, by the entry that crossed the line.
      if (outcome.reason === "wrong-code" && outcome.adminOnly) {
        const { notifyDeliveryNeedsAdmin } = await import("@/server/notify/events");
        await notifyDeliveryNeedsAdmin(String(orderId), "locked");
        revalidatePath("/admin");
      }
      return outcome;
    }

    // After the commit, and only for the entry that actually moved the order:
    // thank the customer and leave them the delivery record. Never throws.
    const { notifyOrderDelivered } = await import("@/server/notify/events");
    await notifyOrderDelivered(String(orderId));

    // Delivered and split: pay the partner now, if automatic payouts are on.
    // After the response, so the person at the door is not kept waiting on
    // ClickPesa; it never throws and cannot undo the delivery.
    const { afterResponse } = await import("@/server/after-response");
    await afterResponse(async () => {
      const { runAutoPayouts } = await import("@/server/money/auto-payouts");
      await runAutoPayouts();
    });

    revalidateSitePath("/partner/orders");
    revalidateSitePath("/account");
    // The admin queue shows the same order and the same status.
    revalidatePath("/admin/orders", "layout");
    revalidatePath("/admin/payouts");
    return { ok: true };
  } catch (error) {
    // Opaque on purpose, matching every other action in this codebase: the
    // reason a write failed is not the caller's business and may name
    // internals.
    await logServerError("confirm-delivery-with-code", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

export type ReportProblemResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "signed-out"
        | "unavailable"
        | "not-a-partner"
        | "not-paid"
        | "note-required"
        | "already-reported"
        | TransitionBlocker;
    };

/**
 * "I can't enter the code" -- the goods are with the customer (or could not be
 * handed over) and the code is not available. Records the partner's words and
 * tells MalFleks. Moves no money and changes no status: an admin settles it.
 */
export async function reportDeliveryProblemAction(
  orderId: string,
  note: string,
): Promise<ReportProblemResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { partnerForUser } = await import("@/server/partners/portal");
    const partner = await partnerForUser(session.uid);
    if (!partner) return { ok: false, reason: "not-a-partner" };

    const { reportDeliveryProblem } = await import("@/server/orders/delivery-code");
    const outcome = await reportDeliveryProblem(
      String(orderId),
      { branchId: partner.branchId, agentId: partner.agentId },
      session.uid,
      note,
    );
    if (!outcome.ok) return outcome;

    const { notifyDeliveryNeedsAdmin } = await import("@/server/notify/events");
    await notifyDeliveryNeedsAdmin(String(orderId), "reported");

    revalidateSitePath("/partner/orders");
    revalidatePath("/admin");
    revalidatePath("/admin/orders", "layout");
    return { ok: true };
  } catch (error) {
    await logServerError("report-delivery-problem", error, session.uid);
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
