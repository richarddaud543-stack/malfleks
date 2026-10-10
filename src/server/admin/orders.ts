import { RULES_ACTOR } from "@/server/orders/status";
import { PAYMENT_ACTOR } from "@/server/payments/settle";
import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import { refundableFor } from "@/server/money/payouts";
import { SPLIT_KINDS } from "@/server/money/payout-rules";

/**
 * The admin order list and the single-order page.
 *
 * `src/server/orders/list-orders.ts` stays as it is: the partner portal reads
 * it, and its "newest 50, by branch or status" shape is exactly what a branch
 * needs. The console needs more — search, more filters, paging, money — so it
 * has its own read here rather than widening a function partners depend on.
 */

export const ORDER_STATUSES = ["pending", "confirmed", "fulfilled", "cancelled"] as const;
export const PAYMENT_FILTERS = ["none", "pending", "captured", "failed"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export const ORDERS_PAGE_SIZE = 40;

export interface OrderSearch {
  q?: string;
  status?: string;
  brandId?: string;
  payment?: string;
  /** YYYY-MM-DD, in Dar es Salaam time. */
  from?: string;
  to?: string;
  page?: number;
}

export interface OrderListRow {
  id: string;
  reference: string;
  status: string;
  createdAt: Date;
  customerFullName: string;
  customerPhone: string;
  productName: string;
  quantity: number;
  brandName: string;
  branchName: string;
  branchCity: string;
  routeKind: string;
  routeCarrier: string;
  lineTotalTZS: number;
  orderTotalTZS: number | null;
  /** The latest attempt's status, or null if no payment was ever requested. */
  payment: string | null;
}

export interface OrderSearchResult {
  rows: OrderListRow[];
  total: number;
  page: number;
  pages: number;
  /** Counts per status for the current search, ignoring the status filter itself — so the chips say what clicking them would show. */
  statusCounts: Record<string, number>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight in Dar es Salaam (UTC+3, no daylight saving) on a YYYY-MM-DD. */
export function eatMidnight(day: string): Date | null {
  if (!DATE_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The WHERE for a search. Pure, so every filter is cheap to test.
 *
 * Free text matches the reference, customer name, product and branch, and —
 * when it has at least four digits — the customer's phone by its trailing
 * digits, so 0754 123 456, +255754123456 and 754123456 all find the same
 * order (phones are stored +255-normalised).
 */
export function orderWhere(search: OrderSearch, { ignoreStatus = false } = {}): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];

  const q = search.q?.trim();
  if (q) {
    const or: Prisma.OrderWhereInput[] = [
      { reference: { contains: q, mode: "insensitive" } },
      { customerFullName: { contains: q, mode: "insensitive" } },
      { productName: { contains: q, mode: "insensitive" } },
      { branchName: { contains: q, mode: "insensitive" } },
      { brandName: { contains: q, mode: "insensitive" } },
    ];
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) {
      const tail = digits.replace(/^(255|0)/, "");
      or.push({ customerPhone: { contains: tail.length >= 4 ? tail : digits } });
    }
    and.push({ OR: or });
  }

  if (!ignoreStatus && search.status && (ORDER_STATUSES as readonly string[]).includes(search.status)) {
    and.push({ status: search.status });
  }

  if (search.brandId) and.push({ brandId: search.brandId });

  switch (search.payment) {
    case "none":
      and.push({ payments: { none: {} } });
      break;
    case "captured":
      and.push({ payments: { some: { status: "captured" } } });
      break;
    case "pending":
    case "failed":
      // "Still waiting" or "failed" means nothing has been captured yet.
      and.push({ payments: { some: { status: search.payment }, none: { status: "captured" } } });
      break;
  }

  const from = search.from ? eatMidnight(search.from) : null;
  const to = search.to ? eatMidnight(search.to) : null;
  if (from) and.push({ createdAt: { gte: from } });
  // "to" is inclusive of the whole day.
  if (to) and.push({ createdAt: { lt: new Date(to.getTime() + 86_400_000) } });

  return and.length ? { AND: and } : {};
}

export async function searchOrders(search: OrderSearch): Promise<OrderSearchResult> {
  const db = getPrisma();
  const page = Math.max(1, Math.floor(search.page ?? 1));
  const where = orderWhere(search);

  const [total, rows, groups] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        customerFullName: true,
        customerPhone: true,
        productName: true,
        quantity: true,
        brandName: true,
        branchName: true,
        branchCity: true,
        routeKind: true,
        routeCarrier: true,
        lineTotalTZS: true,
        quoteOrderTotalTZS: true,
        payments: { orderBy: { initiatedAt: "desc" }, select: { status: true } },
      },
    }),
    db.order.groupBy({ by: ["status"], where: orderWhere(search, { ignoreStatus: true }), _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = { all: 0 };
  for (const s of ORDER_STATUSES) statusCounts[s] = 0;
  for (const g of groups) {
    statusCounts[g.status] = g._count._all;
    statusCounts.all += g._count._all;
  }

  return {
    rows: rows.map(({ payments, quoteOrderTotalTZS, ...r }) => ({
      ...r,
      orderTotalTZS: quoteOrderTotalTZS,
      // A captured attempt outranks a newer failed or pending one.
      payment: payments.some((p) => p.status === "captured") ? "captured" : (payments[0]?.status ?? null),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)),
    statusCounts,
  };
}

// ---------------------------------------------------------------------------
// One order
// ---------------------------------------------------------------------------

export type TimelineItem =
  | { at: Date; type: "created" }
  | {
      at: Date;
      type: "status";
      from: string | null;
      to: string;
      actor: string | null;
      /**
       * What kind of person `actor` is. An `OrderEvent` stores a bare uid, so
       * this is resolved at read time: a uid that manages a partner is that
       * partner's kind, anything else that is set is an admin. Null for an
       * event with no actor at all.
       */
      by: "branch" | "courier" | "admin" | "payment" | "rules" | null;
      note: string | null;
    }
  | { at: Date; type: "payment-link"; amountTZS: number }
  | { at: Date; type: "payment-captured"; amountTZS: number; reference: string }
  | { at: Date; type: "payment-failed"; note: string | null }
  | { at: Date; type: "ping"; note: string | null; latitude: number; longitude: number }
  | { at: Date; type: "ledger"; kind: string; amountTZS: number; note: string | null };

export interface OrderMoney {
  collectedTZS: number;
  refundedTZS: number;
  branchTZS: number;
  courierTZS: number;
  feeTZS: number;
  /** Collected and not yet split, refunded or paid. Only non-zero on a paid order that isn't delivered, or a cancelled one awaiting refund. */
  refundableTZS: number;
  /** Whether the split has been written. */
  split: boolean;
  /** Payout state of this order's partner entries. */
  payouts: { kind: string; amountTZS: number; batchStatus: string | null; batchId: string | null }[];
}

export async function getOrderDetail(id: string) {
  const db = getPrisma();
  const order = await db.order.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { initiatedAt: "asc" } },
      ledgerEntries: { orderBy: { createdAt: "asc" }, include: { payoutBatch: { select: { id: true, status: true } } } },
      deliveryPings: { orderBy: { createdAt: "asc" } },
      product: { select: { id: true, slug: true, hiddenAt: true } },
      // The admin console is the one place besides the customer's own pages
      // that may read the code: an admin settles the deliveries it could not.
      deliveryCode: true,
    },
  });
  if (!order) return null;

  // Since 3 Oct 2026 a branch may confirm or decline its own orders, and since
  // 6 Sep a partner may mark one delivered, so "who moved it" is no longer
  // always an admin. One lookup for every uid in this order's history.
  const actorUids = [...new Set(order.events.map((e) => e.actorUid).filter((uid): uid is string => Boolean(uid)))];

  const [branchPartner, courierPartner, refundableTZS, partnerActors] = await Promise.all([
    order.branchId ? db.partner.findFirst({ where: { branchId: order.branchId }, select: { id: true, displayName: true, phone: true, status: true } }) : null,
    order.agentId ? db.partner.findFirst({ where: { agentId: order.agentId }, select: { id: true, displayName: true, phone: true, status: true } }) : null,
    refundableFor(db, order.id),
    actorUids.length
      ? db.partnerUser.findMany({ where: { uid: { in: actorUids } }, select: { uid: true, partner: { select: { kind: true } } } })
      : [],
  ]);
  const partnerKindByUid = new Map(partnerActors.map((a) => [a.uid, a.partner.kind]));
  const actorRole = (uid: string | null): "branch" | "courier" | "admin" | "payment" | "rules" | null =>
    !uid
      ? null
      : uid === PAYMENT_ACTOR
        ? "payment"
        : uid === RULES_ACTOR
          ? "rules"
          : !partnerKindByUid.has(uid)
            ? "admin"
            : partnerKindByUid.get(uid) === "courier"
              ? "courier"
              : "branch";

  const sum = (kind: string) => order.ledgerEntries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amountTZS, 0);
  const money: OrderMoney = {
    collectedTZS: sum("collected"),
    refundedTZS: sum("refund"),
    branchTZS: sum("branch_payout"),
    courierTZS: sum("courier_payout"),
    feeTZS: sum("malfleks_fee"),
    refundableTZS,
    split: order.ledgerEntries.some((e) => (SPLIT_KINDS as readonly string[]).includes(e.kind)),
    payouts: order.ledgerEntries
      .filter((e) => e.kind === "branch_payout" || e.kind === "courier_payout")
      .map((e) => ({ kind: e.kind, amountTZS: e.amountTZS, batchStatus: e.payoutBatch?.status ?? null, batchId: e.payoutBatch?.id ?? null })),
  };

  const timeline: TimelineItem[] = [{ at: order.createdAt, type: "created" }];
  for (const e of order.events) {
    timeline.push({ at: e.createdAt, type: "status", from: e.fromStatus, to: e.toStatus, actor: e.actorUid, by: actorRole(e.actorUid), note: e.note });
  }
  for (const p of order.payments) {
    timeline.push({ at: p.initiatedAt, type: "payment-link", amountTZS: p.amountTZS });
    if (p.capturedAt) timeline.push({ at: p.capturedAt, type: "payment-captured", amountTZS: p.amountTZS, reference: p.providerRef });
    if (p.failedAt) timeline.push({ at: p.failedAt, type: "payment-failed", note: p.failureNote });
  }
  for (const p of order.deliveryPings) {
    timeline.push({ at: p.createdAt, type: "ping", note: p.note, latitude: p.latitude, longitude: p.longitude });
  }
  for (const e of order.ledgerEntries) {
    // "collected" duplicates the payment-captured line; everything else is news.
    if (e.kind !== "collected") timeline.push({ at: e.createdAt, type: "ledger", kind: e.kind, amountTZS: e.amountTZS, note: e.note });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const latestPayment = order.payments.at(-1) ?? null;
  const captured = order.payments.find((p) => p.status === "captured") ?? null;

  return {
    order,
    timeline,
    money,
    latestPayment,
    captured,
    lastPing: order.deliveryPings.at(-1) ?? null,
    branchPartner,
    courierPartner,
  };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;
