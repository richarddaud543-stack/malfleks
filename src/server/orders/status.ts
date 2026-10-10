import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import { accruePayouts } from "@/server/money/payouts";
import { partnerScopeWhere, type PartnerOrderScope } from "./tracking";

/**
 * Moving an order through its status workflow — the admin half of order
 * management, built the same way `src/server/partners/review.ts` was: a
 * pure, exhaustively-tested "may this transition happen" check, kept
 * separate from the write, and a guarded `updateMany` (the valid source
 * statuses in the WHERE, not `update` by id) so two admin tabs racing the
 * same order can never both win.
 *
 * The vocabulary, defined by the owner (relayed by the Lead) on 2026-08-25:
 *
 * - `pending` (default, unchanged) — submitted, nothing done yet.
 * - `confirmed` — admin verified with the branch that the product is
 *   available at the quoted price and delivery is proceeding. No money has
 *   moved — see `docs/backend.md`'s order-persistence Decision block.
 * - `cancelled` — won't be fulfilled (out of stock, branch declined,
 *   customer unreachable/withdrew). Carries a reason, same convention as a
 *   rejected `PartnerApplication`'s `decisionNote`.
 * - `fulfilled` — delivered / handed off, request complete. Terminal.
 *
 * Transitions: `pending -> confirmed | cancelled`, `confirmed -> fulfilled |
 * cancelled`. Nothing moves out of `fulfilled` or `cancelled` — both are
 * terminal, and neither appears as a source in `ALLOWED_TRANSITIONS` below.
 *
 * Who moves it: MalFleks admin, via `/admin/orders`, through the actions in
 * `src/app/actions/orders.ts` — and, for the two decisions they are the ones
 * who actually know the answer to, the partners themselves:
 *
 * - The owner's call on 6 Sep 2026: the branch or courier fulfilling an order
 *   may mark it `fulfilled`, from `/partner/orders`. "Who actually delivered
 *   it" is known by the partner; admin marking it from a phone call is
 *   transcription.
 * - Changed on 5 Oct 2026: the partner still does it, but only by entering
 *   the **delivery code the customer holds** (`delivery-code.ts`). Delivery is
 *   what makes a partner payable, so it is confirmed by the two people who see
 *   the goods change hands, not by the one who is paid for saying so.
 * - The owner's call on 3 Oct 2026: the **branch** an order was sent to may
 *   answer a `pending` order itself — confirm it, or decline it with a reason
 *   — through `src/server/orders/branch-decisions.ts`. Until then `confirmed`
 *   meant an admin had rung the branch and asked; the branch saying so
 *   directly is the same fact with one fewer phone call in it. The customer's
 *   page already said "Waiting for the branch", and now it is true.
 *
 * - Later the same day: the customer now pays as soon as they order, and the
 *   payment itself confirms the order (`capturePayment`). So the first time a
 *   branch sees most orders they are already `confirmed` and paid -- and the
 *   branch must still be able to say "we can't supply this". `declineOrder`
 *   therefore covers `pending` and `confirmed`. What it does is cancel; the
 *   refund that follows for a paid order is still sent and recorded by an
 *   admin (it shows in "Refunds to send", and MalFleks's inbox is told), so
 *   moving money stays admin's even though the answer is the branch's.
 */

/** The states a transition may move an order *to*. `pending` is never a target. */
export type OrderTarget = "confirmed" | "cancelled" | "fulfilled";

export type TransitionBlocker = "not-found" | "invalid-transition";

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: TransitionBlocker };

/**
 * The only edges this workflow allows. Everything else — including staying
 * put, skipping a step, or moving out of a terminal state — is
 * `invalid-transition`.
 */
const ALLOWED_TRANSITIONS: Record<string, OrderTarget[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  cancelled: [],
  fulfilled: [],
};

/**
 * The statuses `target` may legally be reached from, derived from
 * `ALLOWED_TRANSITIONS` rather than duplicated. This is also what the
 * guarded write's WHERE clause uses below, so the set of allowed edges has
 * exactly one definition in this module.
 */
function sourceStatusesFor(target: OrderTarget): string[] {
  return Object.entries(ALLOWED_TRANSITIONS)
    .filter(([, targets]) => targets.includes(target))
    .map(([status]) => status);
}

/**
 * Whether an order currently in `order.status` may move to `target` — pure,
 * so every edge (and every non-edge) in the table above is cheap to test
 * without a database.
 */
export function canTransition(
  order: { status: string } | null,
  target: OrderTarget
): TransitionCheck {
  if (!order) return { ok: false, reason: "not-found" };
  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  return allowed.includes(target)
    ? { ok: true }
    : { ok: false, reason: "invalid-transition" };
}

export type TransitionOutcome =
  | { ok: true }
  | { ok: false; reason: TransitionBlocker };

/**
 * Moves one order to `target`, stamping who decided and when —
 * `Order.decidedBy`/`decidedAt`/`decisionNote` mirror
 * `PartnerApplication.reviewedBy`/`reviewedAt`/`decisionNote` exactly.
 *
 * The pre-check below (`canTransition`) exists for the *message*, not the
 * safety — same reasoning as `approveApplication`'s pre-check. The actual
 * guarantee is the `updateMany`: the valid source statuses for `target` go
 * in the WHERE, not `update` by id, so a decision that landed a moment ago
 * in another admin tab cannot be silently overwritten. The affected-row
 * count is the answer, not the read above it — that read is already stale
 * by the time the write runs.
 *
 * Nothing in this codebase deletes an `Order` row, so once the pre-check has
 * confirmed the order exists, a `count === 0` from the write below can only
 * mean the status changed underneath it — `invalid-transition`, not
 * `not-found`.
 *
 * **The `OrderEvent` is appended inside the same transaction as the update**,
 * and only when the guarded write actually moved a row. That ordering is the
 * whole point: a transition that lost the race writes no history, so the event
 * log can never claim something happened that did not. A separate write after
 * the fact would be a second chance to disagree with the order's own status.
 */
async function writeTransition(
  orderId: string,
  target: OrderTarget,
  adminUid: string,
  note: string | null,
  /**
   * Narrows the statuses this particular caller may move the order *from*.
   * Never widens them: it is intersected with the table's own edges, so the
   * only thing a caller can do with it is allow less than an admin is allowed.
   */
  onlyFrom?: readonly string[],
  /**
   * Only move the order if no payment for it has been captured. In the WHERE
   * of the guarded write, not checked beforehand: a payment that lands in the
   * moment between a read and the write must lose the order to nobody.
   */
  unpaidOnly = false
): Promise<TransitionOutcome> {
  const db = getPrisma();

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  const check = canTransition(order, target);
  if (!check.ok) return check;
  if (onlyFrom && order && !onlyFrom.includes(order.status)) {
    return { ok: false, reason: "invalid-transition" };
  }

  const sources = sourceStatusesFor(target).filter(
    (status) => !onlyFrom || onlyFrom.includes(status)
  );

  return db.$transaction((tx) => moveOrderInTx(tx, orderId, target, adminUid, note, sources, unpaidOnly));
}

/**
 * The guarded write itself, for a caller that already holds a transaction.
 *
 * `writeTransition` is this plus a pre-check for the message. It is exported
 * for one caller, `delivery-code.ts`, which has to check the customer's code
 * and move the order to `fulfilled` as one atomic step: a code that matched
 * but an order that did not move (or the reverse) must not be a state the
 * database can be left in.
 *
 * `sources` defaults to every status `target` may legally be reached from.
 */
export async function moveOrderInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  target: OrderTarget,
  actorUid: string,
  note: string | null,
  sources: readonly string[] = sourceStatusesFor(target),
  unpaidOnly = false,
): Promise<TransitionOutcome> {
  // Re-read inside the transaction so the event records the status the row
  // was *actually* in when it moved, rather than the one the pre-check saw.
  // Those can differ under the two-tabs race, and the event has to be true.
  const current = await tx.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!current) return { ok: false, reason: "not-found" };

  const { count } = await tx.order.updateMany({
    where: {
      id: orderId,
      status: { in: [...sources] },
      ...(unpaidOnly ? { payments: { none: { status: "captured" } } } : {}),
    },
    data: {
      status: target,
      decidedBy: actorUid,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });

  if (count === 0) {
    return { ok: false, reason: "invalid-transition" };
  }

  await tx.orderEvent.create({
    data: {
      orderId,
      fromStatus: current.status,
      toStatus: target,
      actorUid,
      note,
    },
  });

  // Delivered and paid: split the held money into what the branch, the
  // courier and MalFleks are each owed, in the same transaction, so an order
  // can never be fulfilled-and-paid with its payouts unrecorded. An unpaid
  // order (every pre-escrow one, or a payment still outstanding) simply
  // records nothing here; `settle.ts` does it if the money lands later.
  // Fulfilment is never refused over this -- the goods were delivered.
  if (target === "fulfilled") await accruePayouts(tx, orderId);

  return { ok: true };
}

/**
 * One order's status history, oldest first.
 *
 * Read-only by design: nothing in this codebase updates or deletes an
 * `OrderEvent`, and nothing should. See the note on the model in
 * `prisma/schema.prisma`.
 *
 * An order created before 2026-08-27 returns an empty history rather than a
 * reconstructed one — the events were never recorded, and inventing them would
 * be fabricating a record.
 */
export async function orderHistory(orderId: string) {
  const db = getPrisma();
  return db.orderEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Admin verified with the branch that the product is available at the
 * quoted price and delivery is proceeding. Only valid from `pending`.
 */
export function confirmOrder(
  orderId: string,
  adminUid: string
): Promise<TransitionOutcome> {
  return writeTransition(orderId, "confirmed", adminUid, null);
}

/**
 * Won't be fulfilled — out of stock, branch declined, customer unreachable
 * or withdrew. Valid from `pending` or `confirmed`. `reason` is stored
 * trimmed, or `null` if left blank — same convention as
 * `rejectApplication`'s note.
 */
export function cancelOrder(
  orderId: string,
  adminUid: string,
  reason: string
): Promise<TransitionOutcome> {
  const trimmed = reason.trim();
  return writeTransition(
    orderId,
    "cancelled",
    adminUid,
    trimmed === "" ? null : trimmed
  );
}

/**
 * The branch saying "we can't supply this" — a cancellation that is only
 * valid from `pending`, with a reason. See the module comment for why a
 * branch may decline an unanswered order but not back out of a confirmed one.
 *
 * Ownership is the caller's job (`branch-decisions.ts` proves it from the
 * session before calling this); this function only holds the status guard.
 */
export function declineOrder(
  orderId: string,
  actorUid: string,
  reason: string
): Promise<TransitionOutcome> {
  return writeTransition(orderId, "cancelled", actorUid, reason.trim(), ["pending", "confirmed"]);
}

/**
 * The customer changing their mind about an order they have **not paid for**.
 *
 * Valid from `pending` or `confirmed`, and only while no payment has been
 * captured -- that condition is in the guarded write itself (`unpaidOnly`), so
 * a payment arriving at the same moment cannot be cancelled out from under.
 * An order that has been paid for is not the customer's to cancel alone: the
 * refund is a decision, so they ask (`customer-cancel.ts`) and an admin
 * answers.
 *
 * Ownership is the caller's job: `customer-cancel.ts` finds the order by
 * `reference` **and** `customerId` before this is called.
 */
export const CUSTOMER_CANCEL_NOTE = "Cancelled by the customer";

export function cancelOrderByCustomer(
  orderId: string,
  customerUid: string
): Promise<TransitionOutcome> {
  return writeTransition(orderId, "cancelled", customerUid, CUSTOMER_CANCEL_NOTE, ["pending", "confirmed"], true);
}

/**
 * Who "decided" an order the rulebook moved (`src/server/rules/`). Not a uid;
 * shown as "MalFleks's rules" in the admin timeline.
 */
export const RULES_ACTOR = "system:rules";

/**
 * The rulebook cancelling an order nobody paid for.
 *
 * The same guarded write the customer's own cancel uses: `unpaidOnly` is in
 * the WHERE, so a payment that lands in the moment between the rule reading
 * the order and cancelling it wins, and the order stays alive. `note` is
 * stored as the reason and is what the customer's email quotes.
 */
export function cancelUnpaidOrderByRule(orderId: string, note: string): Promise<TransitionOutcome> {
  return writeTransition(orderId, "cancelled", RULES_ACTOR, note, ["pending", "confirmed"], true);
}

/**
 * The rulebook cancelling a **paid** order the shop did not deliver in time.
 *
 * Only from `confirmed`: an order delivered in the meantime (`fulfilled`) or
 * already cancelled matches nothing. Cancelling is all this does -- the refund
 * that follows is `src/server/money/refund-send.ts`'s, which recognises this
 * actor as one whose cancellations need no further decision.
 */
export function cancelPaidOrderByRule(orderId: string, note: string): Promise<TransitionOutcome> {
  return writeTransition(orderId, "cancelled", RULES_ACTOR, note, ["confirmed"]);
}

/**
 * What is written on the order when MalFleks marks it delivered itself, with
 * no code entered -- the fallback for a delivery the code could not confirm.
 */
export const ADMIN_DELIVERED_NOTE = "Marked delivered by MalFleks, without the customer's code";

/**
 * Delivered / handed off, request complete. Only valid from `confirmed`. Terminal.
 *
 * **Admin only.** Since 5 Oct 2026 a branch or courier cannot mark their own
 * delivery: an order becomes `fulfilled` when the customer's delivery code is
 * entered (`confirmDeliveryWithCode` in `delivery-code.ts`), because the same
 * step makes the partner payable and nobody should be paid on their own word.
 * This function is what is left for the cases the code cannot cover -- the
 * customer's phone is dead, the code is lost, an order settled outside
 * MalFleks -- and it is the owner's decision each time. The note says so, in
 * the order's own history.
 */
export function markOrderFulfilled(
  orderId: string,
  adminUid: string
): Promise<TransitionOutcome> {
  return writeTransition(orderId, "fulfilled", adminUid, ADMIN_DELIVERED_NOTE);
}

/**
 * Resolves `orderId` only if it belongs to this partner's own scope, and says
 * whether any payment for it has been captured.
 *
 * Ownership first, anything else second: `partnerScopeWhere` (shared with
 * `tracking.ts`) puts the caller's own `branchId`/`agentId` in the `WHERE`, so
 * an `orderId` that is real but belongs to someone else's branch or courier
 * reads as not found -- a partner cannot even learn whether an id they don't
 * own exists, let alone act on it.
 */
export async function partnerOwnedOrder(
  orderId: string,
  scope: PartnerOrderScope,
): Promise<{ id: string; status: string; reference: string; paid: boolean } | null> {
  const where = partnerScopeWhere(orderId, scope);
  if (!where) return null;
  const order = await getPrisma().order.findFirst({
    where,
    select: {
      id: true,
      status: true,
      reference: true,
      payments: { where: { status: "captured" }, select: { id: true }, take: 1 },
    },
  });
  return order ? { id: order.id, status: order.status, reference: order.reference, paid: order.payments.length > 0 } : null;
}
