import { getPrisma } from "@/server/db/client";
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
 * Who moves it: mostly MalFleks admin only, via `/admin/orders`, through the
 * actions in `src/app/actions/orders.ts` — **with one deliberate exception**.
 * The owner's call on 6 Sep 2026: the branch or courier actually fulfilling an
 * order may mark it `fulfilled` themselves, from `/partner/orders`, through
 * `markOrderFulfilledByPartner` below and `src/app/actions/partner-orders.ts`.
 * Nothing else moved — `confirmed` still means MalFleks admin rang the branch
 * and verified stock and price, and only admin may `cancel`, since a
 * cancellation is the one transition an interested party has a reason to lie
 * about. "Who actually delivered it" has the opposite property: the partner
 * is the one person who genuinely knows, and admin marking it from a phone
 * call is transcription, not verification.
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
  note: string | null
): Promise<TransitionOutcome> {
  const db = getPrisma();

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  const check = canTransition(order, target);
  if (!check.ok) return check;

  const sources = sourceStatusesFor(target);

  return db.$transaction(async (tx) => {
    // Re-read inside the transaction so the event records the status the row
    // was *actually* in when it moved, rather than the one the pre-check saw.
    // Those can differ under the two-tabs race, and the event has to be true.
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: { in: sources } },
      data: {
        status: target,
        decidedBy: adminUid,
        decidedAt: new Date(),
        decisionNote: note,
      },
    });

    if (count === 0) {
      return { ok: false, reason: "invalid-transition" } as const;
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        fromStatus: current?.status ?? null,
        toStatus: target,
        actorUid: adminUid,
        note,
      },
    });

    return { ok: true } as const;
  });
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

/** Delivered / handed off, request complete. Only valid from `confirmed`. Terminal. */
export function markOrderFulfilled(
  orderId: string,
  adminUid: string
): Promise<TransitionOutcome> {
  return writeTransition(orderId, "fulfilled", adminUid, null);
}

/**
 * The partner fulfilling this order — the branch on a brand-fleet route, the
 * courier on an agent route — marks it delivered themselves.
 *
 * Ownership first, transition second, exactly the order `postDeliveryPing`
 * already uses: `partnerScopeWhere` (shared with `tracking.ts`) puts the
 * caller's own `branchId`/`agentId` in the `WHERE`, so an `orderId` that is
 * real but belongs to someone else's branch or courier reads as `not-found`
 * before `writeTransition` ever runs — a partner cannot even learn whether an
 * id they don't own exists, let alone move it. Only then does the ordinary
 * `pending`/`confirmed` guard in `writeTransition` decide whether `fulfilled`
 * is reachable from wherever the order actually is; nothing here loosens that
 * check for a partner caller.
 *
 * `actorUid` is stamped into `Order.decidedBy` and `OrderEvent.actorUid`
 * exactly like an admin's uid would be — both columns are a bare uid with no
 * role attached, so a reader who needs to know *which* kind of person moved an
 * order still has to cross-reference `PartnerUser`/the admin allowlist. That
 * is an acceptable gap for a single new transition kept this narrow, not an
 * oversight to fix in the same change that adds it.
 */
export function markOrderFulfilledByPartner(
  orderId: string,
  scope: PartnerOrderScope,
  actorUid: string,
): Promise<TransitionOutcome> {
  return partnerOwnedOrderId(orderId, scope).then((ownId) =>
    ownId ? markOrderFulfilled(ownId, actorUid) : { ok: false, reason: "not-found" },
  );
}

/** Resolves `orderId` only if it belongs to this partner's own scope. */
async function partnerOwnedOrderId(
  orderId: string,
  scope: PartnerOrderScope,
): Promise<string | null> {
  const where = partnerScopeWhere(orderId, scope);
  if (!where) return null;
  const order = await getPrisma().order.findFirst({ where, select: { id: true } });
  return order?.id ?? null;
}
