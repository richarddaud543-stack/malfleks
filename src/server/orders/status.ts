import { getPrisma } from "@/server/db/client";

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
 * Who moves it: Soko admin only, via `/admin/orders`, through the actions in
 * `src/app/actions/orders.ts`. There is no partner-facing order queue, and
 * none is faked here — `Partner`/`PartnerUser` records are not linked to
 * "their" orders anywhere in this codebase. Wiring that up is real future
 * scope, not this.
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

  const { count } = await db.order.updateMany({
    where: { id: orderId, status: { in: sourceStatusesFor(target) } },
    data: {
      status: target,
      decidedBy: adminUid,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });

  if (count === 0) {
    return { ok: false, reason: "invalid-transition" };
  }

  return { ok: true };
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
