import { getPrisma } from "@/server/db/client";
import { seriesByDay, type DayPoint } from "@/lib/charts";

/**
 * Everything the Money page shows: where every shilling is.
 *
 * Collected comes from the ledger, not from summing payment rows, because the
 * ledger is the book of record -- a payment row says an attempt was captured;
 * the ledger entry is the accounting fact that the money arrived. If the two
 * ever disagreed, the ledger is the one to believe, and this page should show
 * the one to believe.
 */

const DAY = 86_400_000;
export const MONEY_SERIES_DAYS = 30;

export interface PaymentRow {
  id: string;
  orderReference: string;
  customerName: string;
  brandName: string;
  productName: string;
  amountTZS: number;
  status: string;
  /** What ClickPesa last said, from reconciliation. Null until first checked. */
  providerStatus: string | null;
  initiatedAt: Date;
  capturedAt: Date | null;
  failedAt: Date | null;
  failureNote: string | null;
  lastCheckedAt: Date | null;
}

export interface LedgerRow {
  id: string;
  createdAt: Date;
  kind: string;
  amountTZS: number;
  note: string | null;
  orderReference: string;
}

export interface PayoutRow {
  id: string;
  createdAt: Date;
  payeeType: string;
  totalTZS: number;
  status: string;
  paidAt: Date | null;
}

export interface MoneyOverview {
  totals: {
    collectedTZS: number;
    heldTZS: number;
    paidOutTZS: number;
    awaitingTZS: number;
    awaitingCount: number;
    capturedCount: number;
  };
  series: DayPoint[];
  payments: PaymentRow[];
  ledger: LedgerRow[];
  payouts: PayoutRow[];
  lastReconciledAt: Date | null;
  /** Whether automatic checks can run at all: both halves of the credential present. */
  reconcilerReady: boolean;
}

const PAYMENT_SELECT = {
  id: true,
  amountTZS: true,
  status: true,
  providerStatus: true,
  initiatedAt: true,
  capturedAt: true,
  failedAt: true,
  failureNote: true,
  lastCheckedAt: true,
  order: { select: { reference: true, customerFullName: true, brandName: true, productName: true } },
} as const;

export async function getMoneyOverview(now = new Date()): Promise<MoneyOverview> {
  const db = getPrisma();
  const since = new Date(now.getTime() - MONEY_SERIES_DAYS * DAY);

  const [collected, paidOut, awaiting, capturedCount, recentCollections, payments, ledger, payouts, lastCheck] =
    await Promise.all([
      db.ledgerEntry.aggregate({ where: { kind: "collected" }, _sum: { amountTZS: true } }),
      db.payoutBatch.aggregate({ where: { status: "paid" }, _sum: { totalTZS: true } }),
      db.orderPayment.aggregate({ where: { status: "pending" }, _sum: { amountTZS: true }, _count: { _all: true } }),
      db.orderPayment.count({ where: { status: "captured" } }),
      db.ledgerEntry.findMany({
        where: { kind: "collected", createdAt: { gte: since } },
        select: { createdAt: true, amountTZS: true },
      }),
      // Two reads, not one "latest 50": an old open payment is the one that
      // most needs someone, and a recency cut-off would hide exactly it.
      // Every open payment is listed (up to 200); then the latest captured.
      Promise.all([
        db.orderPayment.findMany({
          where: { status: { not: "captured" } },
          orderBy: { initiatedAt: "asc" },
          take: 200,
          select: PAYMENT_SELECT,
        }),
        db.orderPayment.findMany({
          where: { status: "captured" },
          orderBy: { initiatedAt: "desc" },
          take: 40,
          select: PAYMENT_SELECT,
        }),
      ]).then(([open, captured]) => [...open, ...captured]),
      db.ledgerEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          kind: true,
          amountTZS: true,
          note: true,
          order: { select: { reference: true } },
        },
      }),
      db.payoutBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, createdAt: true, payeeType: true, totalTZS: true, status: true, paidAt: true },
      }),
      db.orderPayment.aggregate({ _max: { lastCheckedAt: true } }),
    ]);

  const collectedTZS = collected._sum.amountTZS ?? 0;
  const paidOutTZS = paidOut._sum.totalTZS ?? 0;

  return {
    totals: {
      collectedTZS,
      heldTZS: collectedTZS - paidOutTZS,
      paidOutTZS,
      awaitingTZS: awaiting._sum.amountTZS ?? 0,
      awaitingCount: awaiting._count._all,
      capturedCount,
    },
    series: seriesByDay(recentCollections, (e) => e.createdAt, (e) => e.amountTZS, now, MONEY_SERIES_DAYS),
    // Already in display order: open (oldest first), then captured (newest first).
    payments: payments
      .map((p) => ({
      id: p.id,
      orderReference: p.order.reference,
      customerName: p.order.customerFullName,
      brandName: p.order.brandName,
      productName: p.order.productName,
      amountTZS: p.amountTZS,
      status: p.status,
      providerStatus: p.providerStatus,
      initiatedAt: p.initiatedAt,
      capturedAt: p.capturedAt,
      failedAt: p.failedAt,
      failureNote: p.failureNote,
      lastCheckedAt: p.lastCheckedAt,
    })),
    ledger: ledger.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      kind: e.kind,
      amountTZS: e.amountTZS,
      note: e.note,
      orderReference: e.order.reference,
    })),
    payouts,
    lastReconciledAt: lastCheck._max.lastCheckedAt ?? null,
    reconcilerReady: Boolean(process.env.CLICKPESA_CLIENT_ID?.trim() && process.env.CLICKPESA_API_KEY?.trim()),
  };
}
