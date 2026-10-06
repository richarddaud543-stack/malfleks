import type { Prisma, PrismaClient } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import {
  MIN_MOBILE_PAYOUT_TZS,
  PAYOUT_KINDS,
  SPLIT_KINDS,
  splitForFulfilment,
  toPayoutPhone,
} from "./payout-rules";

/**
 * Escrow out: working out what partners are owed, grouping it into payouts,
 * and recording refunds.
 *
 * **Nothing in this module sends money.** It keeps the books. A payout is
 * sent either by hand from the ClickPesa merchant dashboard (Payout → Create
 * Payout) and then recorded here with the reference ClickPesa gave it, or --
 * since 5 Oct 2026, when the owner asked for delivered orders to be paid
 * without him touching anything -- by `auto-payouts.ts`, which uses the
 * functions here to draw the payout up and to record what happened to it.
 *
 * The ledger stays append-only. A payout batch is created by stamping
 * `payoutBatchId` onto existing entries; a refund is a new `refund` entry; a
 * cancelled batch releases its entries back to "owed". No entry's amount or
 * kind is ever edited.
 */

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

// ---------------------------------------------------------------------------
// Working out the split
// ---------------------------------------------------------------------------

export type AccrueOutcome =
  | "accrued"
  | "already-accrued"
  | "not-fulfilled"
  | "not-paid"
  | "no-quote"
  | "amount-mismatch"
  | "bad-quote";

/**
 * Writes the branch / courier / MalFleks-fee entries for one fulfilled, paid
 * order. Safe to call any number of times: it writes once.
 *
 * Called from both places an order can become "fulfilled and paid" — the
 * fulfilment transition (`status.ts`) and a capture that lands after
 * fulfilment (`settle.ts`) — inside their transactions, plus a manual
 * "Work out payouts" button for anything that slipped between them.
 *
 * The row lock on the order serialises every caller for the same order.
 * Without it, a fulfilment and a capture committing at the same moment could
 * each see the other's change as not-yet-happened and *both* skip; with it,
 * whichever runs second waits for the first to commit and then sees both
 * facts.
 *
 * `FOR NO KEY UPDATE`, not `FOR UPDATE`, and that is load-bearing. The
 * capture transaction has already inserted a ledger row by the time it gets
 * here, and that row's foreign key holds a `KEY SHARE` lock on this order.
 * The fulfilment transaction holds the `NO KEY UPDATE` lock its own status
 * write took. A plain `FOR UPDATE` conflicts with `KEY SHARE`, so each would
 * wait on the other — Postgres reported exactly that deadlock in
 * `payouts.integration.test.ts` before this was changed. `NO KEY UPDATE`
 * still excludes every other accrual, without fighting a foreign-key check.
 */
export async function accruePayouts(tx: Tx, orderId: string): Promise<AccrueOutcome> {
  await tx.$executeRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR NO KEY UPDATE`;

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      reference: true,
      routeKind: true,
      lineTotalTZS: true,
      quoteGoodsRungTZS: true,
      quoteDeliveryFeeTZS: true,
      quoteDeliveryRungTZS: true,
      quoteOrderTotalTZS: true,
    },
  });
  if (!order || order.status !== "fulfilled") return "not-fulfilled";

  const payment = await tx.orderPayment.findFirst({
    where: { orderId, status: "captured" },
    select: { id: true, amountTZS: true },
  });
  if (!payment) return "not-paid";

  const existing = await tx.ledgerEntry.count({ where: { orderId, kind: { in: [...SPLIT_KINDS] } } });
  if (existing > 0) return "already-accrued";

  const outcome = splitForFulfilment(order, payment.amountTZS);
  if (!outcome.ok) return outcome.reason;

  const { branchTZS, courierTZS, feeTZS } = outcome.split;
  const rows = [
    { kind: "branch_payout", amountTZS: branchTZS, note: `Owed to the branch for ${order.reference}` },
    { kind: "courier_payout", amountTZS: courierTZS, note: `Owed to the courier for ${order.reference}` },
    { kind: "malfleks_fee", amountTZS: feeTZS, note: `MalFleks fees on ${order.reference}` },
  ].filter((r) => r.amountTZS > 0);

  await tx.ledgerEntry.createMany({
    data: rows.map((r) => ({ ...r, orderId, paymentId: payment.id })),
  });
  return "accrued";
}

/** The manual "Work out payouts" button. */
export function accruePayoutsNow(orderId: string): Promise<AccrueOutcome> {
  return getPrisma().$transaction((tx) => accruePayouts(tx, orderId));
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface MoneyTotals {
  collectedTZS: number;
  refundedTZS: number;
  paidOutTZS: number;
  /** Collected, less refunds, less payouts marked sent. What should be in the ClickPesa balance. */
  heldTZS: number;
  /** MalFleks's own fees on delivered orders. Part of `heldTZS`; never paid out. */
  feesEarnedTZS: number;
  /** Owed to partners on delivered orders, not yet put into a payout. */
  owedTZS: number;
  /** In payouts drawn up (or being sent) but not yet recorded as sent. */
  inPayoutsTZS: number;
}

/**
 * A payout that has been drawn up and has no final answer yet: `pending`
 * (waiting to be sent by hand) or `sending` (MalFleks asked ClickPesa to send
 * it and is waiting to hear). Both still hold their ledger entries.
 */
export const OPEN_BATCH_STATUSES = ["pending", "sending"] as const;

export async function moneyTotals(db: Db = getPrisma()): Promise<MoneyTotals> {
  const [byKind, owed, paid, pending] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ["kind"], _sum: { amountTZS: true } }),
    db.ledgerEntry.aggregate({
      where: { kind: { in: [...PAYOUT_KINDS] }, payoutBatchId: null },
      _sum: { amountTZS: true },
    }),
    db.payoutBatch.aggregate({ where: { status: "paid" }, _sum: { totalTZS: true } }),
    db.payoutBatch.aggregate({ where: { status: { in: [...OPEN_BATCH_STATUSES] } }, _sum: { totalTZS: true } }),
  ]);
  const sum = (kind: string) => byKind.find((g) => g.kind === kind)?._sum.amountTZS ?? 0;

  const collectedTZS = sum("collected");
  const refundedTZS = sum("refund");
  const paidOutTZS = paid._sum.totalTZS ?? 0;
  return {
    collectedTZS,
    refundedTZS,
    paidOutTZS,
    heldTZS: collectedTZS - refundedTZS - paidOutTZS,
    feesEarnedTZS: sum("malfleks_fee"),
    owedTZS: owed._sum.amountTZS ?? 0,
    inPayoutsTZS: pending._sum.totalTZS ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Payees
// ---------------------------------------------------------------------------

export type PayeeType = "branch" | "agent";

export interface PayeeInfo {
  payeeType: PayeeType;
  payeeId: string;
  name: string;
  /** "Toyota · Dar es Salaam" or "Courier · Arusha" */
  detail: string;
  phone: string | null;
  /** The phone in ClickPesa's payout format, when it is a mobile number. */
  payoutPhone: string | null;
  partnerId: string | null;
}

/**
 * Names and numbers for a set of payees. A partner's own phone wins over the
 * catalogue's, because it is the number they gave MalFleks to be reached on;
 * the branch's public number is the fallback.
 */
async function payeeInfo(db: Db, keys: { payeeType: PayeeType; payeeId: string }[]): Promise<Map<string, PayeeInfo>> {
  const branchIds = keys.filter((k) => k.payeeType === "branch").map((k) => k.payeeId);
  const agentIds = keys.filter((k) => k.payeeType === "agent").map((k) => k.payeeId);

  const [branches, agents, partners] = await Promise.all([
    branchIds.length
      ? db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true, city: true, phone: true, brand: { select: { name: true } } } })
      : [],
    agentIds.length
      ? db.deliveryAgent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, city: true, phone: true } })
      : [],
    db.partner.findMany({
      where: { OR: [{ branchId: { in: branchIds } }, { agentId: { in: agentIds } }] },
      select: { id: true, phone: true, branchId: true, agentId: true },
    }),
  ]);

  const map = new Map<string, PayeeInfo>();
  for (const b of branches) {
    const partner = partners.find((p) => p.branchId === b.id);
    const phone = partner?.phone ?? b.phone ?? null;
    map.set(`branch:${b.id}`, {
      payeeType: "branch",
      payeeId: b.id,
      name: b.name,
      detail: `${b.brand.name} · ${b.city}`,
      phone,
      payoutPhone: toPayoutPhone(phone),
      partnerId: partner?.id ?? null,
    });
  }
  for (const a of agents) {
    const partner = partners.find((p) => p.agentId === a.id);
    const phone = partner?.phone ?? a.phone ?? null;
    map.set(`agent:${a.id}`, {
      payeeType: "agent",
      payeeId: a.id,
      name: a.name,
      detail: `Courier · ${a.city}`,
      phone,
      payoutPhone: toPayoutPhone(phone),
      partnerId: partner?.id ?? null,
    });
  }
  return map;
}

function fallbackPayee(payeeType: PayeeType, payeeId: string, name?: string): PayeeInfo {
  return {
    payeeType,
    payeeId,
    name: name ?? (payeeType === "branch" ? "Branch no longer listed" : "Courier no longer listed"),
    detail: payeeType === "branch" ? "Branch" : "Courier",
    phone: null,
    payoutPhone: null,
    partnerId: null,
  };
}

// ---------------------------------------------------------------------------
// What is owed
// ---------------------------------------------------------------------------

export interface OwedEntry {
  id: string;
  orderId: string;
  orderReference: string;
  amountTZS: number;
  createdAt: Date;
}

export interface PayeeOwed extends PayeeInfo {
  totalTZS: number;
  oldestAt: Date;
  entries: OwedEntry[];
  /** ClickPesa won't send a mobile payout this small. */
  belowMinimum: boolean;
}

export interface OwedSummary {
  payees: PayeeOwed[];
  /** Owed on an order whose branch or courier has since been removed — nobody to pay until it is sorted out. */
  unassigned: OwedEntry[];
}

/** Every payout entry not yet in a batch, grouped by who it is owed to. Oldest debt first. */
export async function listOwed(db: Db = getPrisma()): Promise<OwedSummary> {
  const rows = await db.ledgerEntry.findMany({
    where: { kind: { in: [...PAYOUT_KINDS] }, payoutBatchId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      amountTZS: true,
      createdAt: true,
      orderId: true,
      order: { select: { reference: true, branchId: true, agentId: true, branchName: true, routeCarrier: true } },
    },
  });

  const groups = new Map<string, { payeeType: PayeeType; payeeId: string; fallbackName: string; entries: OwedEntry[] }>();
  const unassigned: OwedEntry[] = [];

  for (const r of rows) {
    const entry: OwedEntry = { id: r.id, orderId: r.orderId, orderReference: r.order.reference, amountTZS: r.amountTZS, createdAt: r.createdAt };
    const payeeType: PayeeType = r.kind === "courier_payout" ? "agent" : "branch";
    const payeeId = payeeType === "agent" ? r.order.agentId : r.order.branchId;
    if (!payeeId) {
      unassigned.push(entry);
      continue;
    }
    const key = `${payeeType}:${payeeId}`;
    const group = groups.get(key) ?? {
      payeeType,
      payeeId,
      fallbackName: payeeType === "agent" ? r.order.routeCarrier : r.order.branchName,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }

  const info = await payeeInfo(db, [...groups.values()]);
  const payees = [...groups.entries()].map(([key, g]) => {
    const totalTZS = g.entries.reduce((s, e) => s + e.amountTZS, 0);
    return {
      ...(info.get(key) ?? fallbackPayee(g.payeeType, g.payeeId, g.fallbackName)),
      totalTZS,
      oldestAt: g.entries[0].createdAt,
      entries: g.entries,
      belowMinimum: totalTZS < MIN_MOBILE_PAYOUT_TZS,
    };
  });
  payees.sort((a, b) => a.oldestAt.getTime() - b.oldestAt.getTime());
  return { payees, unassigned };
}

// ---------------------------------------------------------------------------
// Payout batches
// ---------------------------------------------------------------------------

export type CreateBatchOutcome =
  | { ok: true; batchId: string; totalTZS: number }
  | { ok: false; reason: "nothing-owed" | "changed" };

class BatchChanged extends Error {}

/**
 * Puts everything currently owed to one payee into a new payout, ready to be
 * sent. The entries are claimed with a guarded `updateMany` (only rows still
 * unbatched); if another tab claimed any of them first, the whole thing rolls
 * back rather than producing a batch whose total disagrees with its entries.
 */
export async function createPayoutBatch(
  payee: { payeeType: PayeeType; payeeId: string },
  adminUid: string,
): Promise<CreateBatchOutcome> {
  const kind = payee.payeeType === "agent" ? "courier_payout" : "branch_payout";
  const orderWhere = payee.payeeType === "agent" ? { agentId: payee.payeeId } : { branchId: payee.payeeId };

  try {
    return await getPrisma().$transaction(async (tx) => {
      const entries = await tx.ledgerEntry.findMany({
        where: { kind, payoutBatchId: null, order: orderWhere },
        select: { id: true, amountTZS: true },
      });
      if (entries.length === 0) return { ok: false, reason: "nothing-owed" } as const;

      const totalTZS = entries.reduce((s, e) => s + e.amountTZS, 0);
      const batch = await tx.payoutBatch.create({
        data: { payeeType: payee.payeeType, payeeId: payee.payeeId, totalTZS, createdBy: adminUid },
        select: { id: true },
      });
      const { count } = await tx.ledgerEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, payoutBatchId: null },
        data: { payoutBatchId: batch.id },
      });
      if (count !== entries.length) throw new BatchChanged();
      return { ok: true, batchId: batch.id, totalTZS } as const;
    });
  } catch (error) {
    if (error instanceof BatchChanged) return { ok: false, reason: "changed" };
    throw error;
  }
}

export type MarkPaidOutcome =
  | { ok: true }
  | { ok: false; reason: "not-pending" | "reference-used" | "bad-reference" };

/** ClickPesa payout ids and mobile-money transaction ids are short alphanumerics. */
export function cleanReference(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 4 || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/.test(trimmed)) return null;
  return trimmed;
}

/** Records that a payout was sent, with the reference ClickPesa (or the network) gave it. */
export async function markPayoutPaid(batchId: string, rawReference: string, adminUid: string): Promise<MarkPaidOutcome> {
  const reference = cleanReference(rawReference);
  if (!reference) return { ok: false, reason: "bad-reference" };
  try {
    const { count } = await getPrisma().payoutBatch.updateMany({
      // `sending` too: a payout MalFleks sent itself and never heard back about
      // is settled by an admin reading the reference off the ClickPesa dashboard.
      where: { id: batchId, status: { in: [...OPEN_BATCH_STATUSES] } },
      data: { status: "paid", providerRef: reference, paidAt: new Date(), paidBy: adminUid },
    });
    return count === 1 ? { ok: true } : { ok: false, reason: "not-pending" };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, reason: "reference-used" };
    throw error;
  }
}

export type CancelBatchOutcome = { ok: true; released: number } | { ok: false; reason: "not-pending" };

/**
 * A payout that was drawn up but will not be sent (wrong number, bounced,
 * changed mind). The batch is kept as a record, marked failed with the reason;
 * its entries go back to "owed" so they can be paid in a new one.
 */
export async function cancelPayoutBatch(batchId: string, reason: string, adminUid: string): Promise<CancelBatchOutcome> {
  return getPrisma().$transaction(async (tx) => {
    const { count } = await tx.payoutBatch.updateMany({
      where: { id: batchId, status: { in: [...OPEN_BATCH_STATUSES] } },
      data: { status: "failed", failedAt: new Date(), failureNote: `${reason.trim() || "Cancelled"} (by ${adminUid})` },
    });
    if (count === 0) return { ok: false, reason: "not-pending" } as const;
    const released = await tx.ledgerEntry.updateMany({ where: { payoutBatchId: batchId }, data: { payoutBatchId: null } });
    return { ok: true, released: released.count } as const;
  });
}

export interface BatchRow extends PayeeInfo {
  id: string;
  totalTZS: number;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  failedAt: Date | null;
  failureNote: string | null;
  reference: string | null;
  entryCount: number;
  orderReferences: string[];
  /** Set when MalFleks sent (or tried to send) this one itself. */
  sendRef: string | null;
  sendStartedAt: Date | null;
  feeTZS: number | null;
  /** True when it was sent by MalFleks itself, not recorded by a person. */
  automatic: boolean;
}

export async function listPayoutBatches(limit = 50, db: Db = getPrisma()): Promise<BatchRow[]> {
  const batches = await db.payoutBatch.findMany({
    // Waiting to be sent first, then the most recent.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      payeeType: true,
      payeeId: true,
      totalTZS: true,
      status: true,
      createdAt: true,
      paidAt: true,
      failedAt: true,
      failureNote: true,
      providerRef: true,
      sendRef: true,
      sendStartedAt: true,
      feeTZS: true,
      entries: { select: { order: { select: { reference: true } } } },
    },
  });
  const keys = batches.map((b) => ({ payeeType: b.payeeType as PayeeType, payeeId: b.payeeId }));
  const info = await payeeInfo(db, keys);
  const rank: Record<string, number> = { sending: 0, pending: 0, paid: 1, failed: 2 };
  return batches
    .map((b) => ({
      ...(info.get(`${b.payeeType}:${b.payeeId}`) ?? fallbackPayee(b.payeeType as PayeeType, b.payeeId)),
      id: b.id,
      totalTZS: b.totalTZS,
      status: b.status,
      createdAt: b.createdAt,
      paidAt: b.paidAt,
      failedAt: b.failedAt,
      failureNote: b.failureNote,
      reference: b.providerRef,
      entryCount: b.entries.length,
      orderReferences: [...new Set(b.entries.map((e) => e.order.reference))],
      sendRef: b.sendRef,
      sendStartedAt: b.sendStartedAt,
      feeTZS: b.feeTZS,
      automatic: b.sendRef !== null,
    }))
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.createdAt.getTime() - a.createdAt.getTime());
}

/** Names and numbers for one payee, for a partner's own page. */
export async function payeeTotals(payee: { payeeType: PayeeType; payeeId: string }, db: Db = getPrisma()) {
  const kind = payee.payeeType === "agent" ? "courier_payout" : "branch_payout";
  const orderWhere = payee.payeeType === "agent" ? { agentId: payee.payeeId } : { branchId: payee.payeeId };
  const [owed, paid, pending] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { kind, payoutBatchId: null, order: orderWhere }, _sum: { amountTZS: true } }),
    db.payoutBatch.aggregate({ where: { ...payee, status: "paid" }, _sum: { totalTZS: true } }),
    db.payoutBatch.aggregate({ where: { ...payee, status: { in: [...OPEN_BATCH_STATUSES] } }, _sum: { totalTZS: true } }),
  ]);
  return {
    owedTZS: owed._sum.amountTZS ?? 0,
    paidTZS: paid._sum.totalTZS ?? 0,
    inPayoutsTZS: pending._sum.totalTZS ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-cancelled" | "bad-amount" | "too-much" | "bad-reference" };

/**
 * Records a refund an admin has already sent the customer (from the ClickPesa
 * dashboard or by mobile money). Only on a cancelled order, and never more
 * than is still held for it. How much to refund is the admin's call — the
 * refund policy for full escrow is still an open decision — so this records a
 * number, it does not compute one.
 */
export async function recordRefund(
  orderId: string,
  amountTZS: number,
  rawReference: string,
  adminUid: string,
): Promise<RefundOutcome> {
  const reference = cleanReference(rawReference);
  if (!reference) return { ok: false, reason: "bad-reference" };
  if (!Number.isInteger(amountTZS) || amountTZS <= 0) return { ok: false, reason: "bad-amount" };

  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR NO KEY UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) return { ok: false, reason: "not-found" } as const;
    if (order.status !== "cancelled") return { ok: false, reason: "not-cancelled" } as const;

    const refundable = await refundableFor(tx, orderId);
    if (amountTZS > refundable) return { ok: false, reason: "too-much" } as const;

    await tx.ledgerEntry.create({
      data: { orderId, kind: "refund", amountTZS, note: `Refund ${reference} · recorded by ${adminUid}` },
    });
    return { ok: true } as const;
  });
}

/** Collected for this order, less what has already been refunded or split out. */
export async function refundableFor(db: Db, orderId: string): Promise<number> {
  const groups = await db.ledgerEntry.groupBy({ by: ["kind"], where: { orderId }, _sum: { amountTZS: true } });
  const sum = (k: string) => groups.find((g) => g.kind === k)?._sum.amountTZS ?? 0;
  return sum("collected") - sum("refund") - SPLIT_KINDS.reduce((s, k) => s + sum(k), 0);
}

// ---------------------------------------------------------------------------
// Work waiting, for the sidebar badge and the Overview queues
// ---------------------------------------------------------------------------

export interface MoneyWork {
  /** Payees owed money that is not yet in a payout. */
  payeesOwed: number;
  /** Payouts drawn up and not yet recorded as sent. */
  pendingBatches: number;
  /** The older of: the oldest owed entry, the oldest unsent payout. */
  oldestPayout: Date | null;
  /** Cancelled orders still holding the customer's money. */
  refundsDue: { orderId: string; reference: string; refundableTZS: number; cancelledAt: Date | null }[];
}

export async function moneyWork(db: Db = getPrisma()): Promise<MoneyWork> {
  const [owed, batches, cancelledPaid] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { kind: { in: [...PAYOUT_KINDS] }, payoutBatchId: null },
      select: { kind: true, createdAt: true, order: { select: { branchId: true, agentId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.payoutBatch.findMany({ where: { status: { in: [...OPEN_BATCH_STATUSES] } }, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
    db.order.findMany({
      where: { status: "cancelled", payments: { some: { status: "captured" } } },
      select: { id: true, reference: true, decidedAt: true },
    }),
  ]);

  const payees = new Set(
    owed.map((e) => (e.kind === "courier_payout" ? `agent:${e.order.agentId}` : `branch:${e.order.branchId}`)),
  );
  const candidates = [owed[0]?.createdAt, batches[0]?.createdAt].filter((d): d is Date => Boolean(d));
  const oldestPayout = candidates.length ? new Date(Math.min(...candidates.map((d) => d.getTime()))) : null;

  const refundsDue = (
    await Promise.all(
      cancelledPaid.map(async (o) => ({
        orderId: o.id,
        reference: o.reference,
        refundableTZS: await refundableFor(db, o.id),
        cancelledAt: o.decidedAt,
      })),
    )
  ).filter((r) => r.refundableTZS > 0);

  return { payeesOwed: payees.size, pendingBatches: batches.length, oldestPayout, refundsDue };
}
