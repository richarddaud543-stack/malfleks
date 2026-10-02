import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { notifyOrderCancelled } from "@/server/notify/events";
import { partnerForUser } from "@/server/partners/portal";
import { openCheckout } from "./checkout";
import { confirmOrder, declineOrder, type TransitionBlocker } from "./status";

/**
 * The branch answering its own orders.
 *
 * Until 3 Oct 2026 only a MalFleks admin could confirm or cancel an order, and
 * did it by phoning the branch and typing in what they said. The customer's
 * page said "Waiting for the branch" and the branch's own page labelled the
 * order "New — waiting on you", with no control beside it. This module is that
 * control: the partner who owns the branch an order was sent to may confirm it
 * ("we have it at this price") or decline it with a reason.
 *
 * ## Who may, proved from the database on every call
 *
 * The caller supplies a uid (from the verified session, by the Server Action)
 * and an order id, and neither is trusted to say anything about ownership:
 *
 *  1. the uid must manage a `Partner` (`PartnerUser`),
 *  2. that partner must be `active` -- a suspended partner may look, not act,
 *  3. that partner must own a branch (`Partner.branchId`), and
 *  4. the order's `branchId` must be that branch.
 *
 * A courier fails at step 3 even on an order they are carrying: the question
 * being answered is "does the branch have this at this price", and the
 * courier does not know. An order id from someone else's branch fails at step
 * 4 and reads as `not-found`, the same answer as an id that does not exist --
 * the caller learns nothing about orders that are not theirs.
 *
 * ## Who decided is recorded the way it already was
 *
 * The partner's uid goes into `Order.decidedBy` and `OrderEvent.actorUid`,
 * exactly where an admin's would. The admin timeline resolves a uid that
 * belongs to a `PartnerUser` and says "confirmed by the branch"; see
 * `getOrderDetail` in `src/server/admin/orders.ts`.
 *
 * ## What confirming does next
 *
 * The same thing it does when an admin confirms (`src/app/actions/orders.ts`):
 * the checkout is opened and the customer is emailed where to pay. And for the
 * same reason it is kept apart from the confirmation itself -- a ClickPesa
 * outage must not un-confirm an order; `/pay/[reference]` makes the link on
 * demand if this could not.
 *
 * A second confirm of the same order moves nothing (`invalid-transition`, from
 * the guarded write in `status.ts`), so it opens no second checkout and sends
 * no second email.
 */

/** A reason shorter than this is a slip of the thumb, not a reason. */
export const MIN_DECLINE_REASON_LENGTH = 3;
const MAX_DECLINE_REASON_LENGTH = 300;

export type BranchDecisionBlocker =
  | "not-a-partner"
  | "partner-suspended"
  | "reason-required"
  | TransitionBlocker;

export type BranchConfirmOutcome =
  /** `emailed` is whether the customer was sent the pay link just now. */
  | { ok: true; emailed: boolean }
  | { ok: false; reason: BranchDecisionBlocker };

export type BranchDeclineOutcome =
  | { ok: true }
  | { ok: false; reason: BranchDecisionBlocker };

/** The order's id, only if `uid` manages the active partner that owns its branch. */
async function orderOwnedByBranchOf(
  uid: string,
  orderId: string,
): Promise<{ ok: true; orderId: string } | { ok: false; reason: BranchDecisionBlocker }> {
  const partner = await partnerForUser(uid);
  if (!partner) return { ok: false, reason: "not-a-partner" };
  if (partner.status !== "active") return { ok: false, reason: "partner-suspended" };
  // A courier, or a branch partner not on the map yet: owns no branch, so
  // owns no order's branch either.
  if (!partner.branchId) return { ok: false, reason: "not-found" };

  const order = await getPrisma().order.findFirst({
    where: { id: orderId, branchId: partner.branchId },
    select: { id: true },
  });
  return order ? { ok: true, orderId: order.id } : { ok: false, reason: "not-found" };
}

/** "We have it at this price." Moves `pending -> confirmed`, then opens the customer's checkout. */
export async function confirmOrderAsBranch(uid: string, orderId: string): Promise<BranchConfirmOutcome> {
  const owned = await orderOwnedByBranchOf(uid, orderId);
  if (!owned.ok) return owned;

  const outcome = await confirmOrder(owned.orderId, uid);
  if (!outcome.ok) return outcome;

  let emailed = false;
  try {
    const opened = await openCheckout(owned.orderId);
    if (opened.ok) emailed = opened.emailed;
    else if (opened.reason !== "unquotable") {
      await logServerError("checkout-open", new Error(`${owned.orderId}: ${opened.reason}`), uid);
    }
  } catch (error) {
    await logServerError("checkout-open", error, uid);
  }

  return { ok: true, emailed };
}

/**
 * "We can't supply this." Moves `pending -> cancelled` with the branch's
 * reason, and tells the customer -- who, on a pending order, has paid nothing.
 */
export async function declineOrderAsBranch(
  uid: string,
  orderId: string,
  reason: string,
): Promise<BranchDeclineOutcome> {
  // Bounded: the reason is stored, shown to an admin and emailed to the
  // customer, and none of those is the place for an essay.
  const trimmed = typeof reason === "string" ? reason.trim().slice(0, MAX_DECLINE_REASON_LENGTH) : "";
  if (trimmed.length < MIN_DECLINE_REASON_LENGTH) return { ok: false, reason: "reason-required" };

  const owned = await orderOwnedByBranchOf(uid, orderId);
  if (!owned.ok) return owned;

  const outcome = await declineOrder(owned.orderId, uid, trimmed);
  if (!outcome.ok) return outcome;

  await notifyOrderCancelled(owned.orderId);
  return { ok: true };
}
