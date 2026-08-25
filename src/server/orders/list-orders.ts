import { getPrisma } from "@/server/db/client";

/**
 * Listing persisted orders — the admin half of order persistence.
 *
 * Mirrors the shape of `src/server/partners/review.ts`: a trimmed interface
 * ("trimmed to what the page renders"), a pure `serialise` mapper, and no
 * writes at all in this module. Unlike the review queue, there is no decision
 * function here — this round is deliberately read-only. See the note on
 * `status` below for why.
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

  requestedAt: string;
  createdAt: string;
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
  requestedAt: Date;
  createdAt: Date;
}): ListedOrder {
  return {
    ...row,
    requestedAt: row.requestedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Orders, newest-first, optionally narrowed by branch and/or status.
 *
 * **On `status`: every order today is `"pending"`, because nothing in the
 * codebase has ever written another value.** This function accepts a status
 * filter because the column is indexed and the query is free to support —
 * but no status *vocabulary* exists yet: what values are possible, who is
 * allowed to move an order between them, and whether that is Soko's call or
 * the branch's, is a real product decision this codebase leaves deliberately
 * undecided rather than having an engineer guess at it. Same convention as
 * the still-open retention-policy gap on saved order requests (see
 * `docs/engineering-standards.md`'s debt register, row #20). Nothing here
 * writes `status` — this module, and the page built on it, are read-only.
 */
export async function listOrders(
  filter: ListOrdersFilter = {},
  limit: number = DEFAULT_LIMIT
): Promise<ListedOrder[]> {
  const rows = await getPrisma().order.findMany({
    where: {
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serialise);
}
