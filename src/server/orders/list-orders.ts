import { getPrisma } from "@/server/db/client";

/**
 * Listing persisted orders — the admin half of order persistence.
 *
 * Mirrors the shape of `src/server/partners/review.ts`: a trimmed interface
 * ("trimmed to what the page renders"), a pure `serialise` mapper, and no
 * writes at all in this module. The decision functions live next to this in
 * `src/server/orders/status.ts` — this module stays read-only, the same
 * split `review.ts` (decisions) and the partner-application listing keep.
 */

/** What an admin sees in the order list. Trimmed to what the page renders. */
export interface ListedOrder {
  id: string;
  status: string;
  reference: string;

  customerId: string | null;
  customerFullName: string;
  customerPhone: string;
  customerAddress: string;

  productName: string;
  quantity: number;
  unitPriceTZS: number;
  lineTotalTZS: number;

  brandName: string;
  branchId: string | null;
  branchName: string;
  branchCity: string;
  branchPhone: string | null;

  routeKind: string;
  routeCarrier: string;
  routeAgentPhone: string | null;
  routeEtaEstimate: string | null;

  /** Set once a transition in `status.ts` has run; null on a still-pending order. */
  decidedAt: string | null;
  /** Why, for a cancellation — same convention as `ReviewableApplication.decisionNote`. */
  decisionNote: string | null;

  requestedAt: string;
  createdAt: string;

  /**
   * The most recent `OrderPayment` attempt against this order, if any --
   * `null` for every pre-escrow order and for a `pending`/`cancelled` order
   * nobody has requested payment for yet. Added 19 Sep 2026 so
   * `/admin/orders` can show payment state without a second query per card.
   */
  payment: { status: string; checkoutLink: string | null } | null;
}

export interface ListOrdersFilter {
  /**
   * `Order.branchId` is nullable (`onDelete: SetNull` — see the schema
   * comment), so this filters on the *current* link, not the snapshot. An
   * order whose branch was since deleted drops out of every branch filter,
   * which is correct: there is no longer a branch to call about it, and the
   * unfiltered list still shows it via its snapshot fields.
   */
  branchId?: string;
  /**
   * `Order.agentId` — the courier a customer chose. Same nullability and same
   * reasoning as `branchId` above.
   *
   * Added so a courier partner can see their own jobs on `/partner/orders`.
   * Before it, a courier could be picked by a customer, named on the order and
   * printed on the confirmation screen, and still have no way to learn the job
   * existed except by the branch phoning them.
   */
  agentId?: string;
  status?: string;
}

/**
 * The most orders one admin view loads at once, matching the precedent in
 * `listOrderRequestsForCustomer` (`src/server/orders/saved-requests.ts`):
 * a `limit`, not a full cursor-paginated search UI, because nothing here
 * needs more than that yet.
 */
const DEFAULT_LIMIT = 50;

function serialise(row: {
  id: string;
  status: string;
  reference: string;
  payments: { status: string; checkoutLink: string | null }[];
  customerId: string | null;
  customerFullName: string;
  customerPhone: string;
  customerAddress: string;
  productName: string;
  quantity: number;
  unitPriceTZS: number;
  lineTotalTZS: number;
  brandName: string;
  branchId: string | null;
  branchName: string;
  branchCity: string;
  branchPhone: string | null;
  routeKind: string;
  routeCarrier: string;
  routeAgentPhone: string | null;
  routeEtaEstimate: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  requestedAt: Date;
  createdAt: Date;
}): ListedOrder {
  const { payments, ...rest } = row;
  return {
    ...rest,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    requestedAt: row.requestedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    payment: payments[0]
      ? { status: payments[0].status, checkoutLink: payments[0].checkoutLink }
      : null,
  };
}

/**
 * Orders, newest-first, optionally narrowed by branch and/or status.
 *
 * **On `status`:** `"pending"` | `"confirmed"` | `"cancelled"` |
 * `"fulfilled"`, the vocabulary the owner defined on 2026-08-25. MalFleks admin
 * alone moves an order between them, from `/admin/orders`, through the
 * guarded transitions in `src/server/orders/status.ts` — see that module's
 * doc comment for the full table and who may move what. This function
 * accepts a status filter because the column is indexed and the query is
 * free to support; it does not write it.
 */
export async function listOrders(
  filter: ListOrdersFilter = {},
  limit: number = DEFAULT_LIMIT
): Promise<ListedOrder[]> {
  const rows = await getPrisma().order.findMany({
    where: {
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      payments: {
        // A captured attempt first, then the newest: "is it paid" must not be
        // hidden by a later attempt that failed or was never used.
        orderBy: [{ capturedAt: { sort: "desc", nulls: "last" } }, { initiatedAt: "desc" }],
        take: 1,
        select: { status: true, checkoutLink: true },
      },
    },
  });
  return rows.map(serialise);
}
