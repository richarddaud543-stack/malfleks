// @vitest-environment node
//
// Real Postgres. Payouts are money leaving MalFleks, so the properties that
// matter are about the database refusing the wrong thing: an order split
// exactly once even when fulfilment and payment land together, a payout batch
// that can't claim an entry twice, a refund that can't exceed what is held.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createOrder } from "@/server/orders/create-order";
import { cancelOrder, confirmOrder, markOrderFulfilled } from "@/server/orders/status";
import { capturePayment } from "@/server/payments/settle";
import {
  accruePayoutsNow,
  cancelPayoutBatch,
  createPayoutBatch,
  listOwed,
  markPayoutPaid,
  moneyTotals,
  moneyWork,
  recordRefund,
} from "./payouts";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("payouts");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let sequence = 0;

/**
 * A confirmed order with a full quote and a pending payment link — what the
 * real flow produces once a city has a delivery fee. The quote numbers are a
 * real ladder result: 100,000 goods → 6,000 goods fee; 3,000 delivery → 500.
 */
async function quotedOrder(route: "brand" | "agent" = "agent") {
  const created = await createOrder(
    {
      productId: "toyota-corolla",
      quantity: "1",
      fullName: "Asha Mwenda",
      phone: "0754123456",
      address: "Mikocheni B",
      agentId: null,
      reference: "",
      requestedAt: new Date().toISOString(),
    },
    null,
  );
  if (!created.ok) throw new Error(created.reason);
  const prisma = getPrisma();
  const agent = route === "agent";
  await prisma.order.update({
    where: { id: created.value.id },
    data: {
      unitPriceTZS: 100_000,
      lineTotalTZS: 100_000,
      routeKind: route,
      agentId: agent ? "bolt-send" : null,
      routeCarrier: agent ? "Bolt Send" : "Toyota Tanzania",
      quoteGoodsRungTZS: 6_000,
      quoteDeliveryFeeTZS: agent ? 3_000 : 0,
      quoteDeliveryRungTZS: agent ? 500 : 0,
      quoteOrderTotalTZS: agent ? 103_000 : 100_000,
    },
  });
  await confirmOrder(created.value.id, "admin-1");
  sequence += 1;
  const providerRef = `PAYOUT${sequence}X${Date.now()}`;
  const total = agent ? 103_000 : 100_000;
  await prisma.orderPayment.create({
    data: { orderId: created.value.id, providerRef, provider: "clickpesa", amountTZS: total },
  });
  return { orderId: created.value.id, providerRef, total };
}

const pay = (o: { providerRef: string; total: number }, ref = `CP${o.providerRef}`) =>
  capturePayment({ providerRef: o.providerRef, paymentReference: ref, collectedAmount: o.total, source: "webhook" });

const entries = (orderId: string) =>
  getPrisma().ledgerEntry.findMany({ where: { orderId }, orderBy: { kind: "asc" }, select: { kind: true, amountTZS: true, payoutBatchId: true } });

describe("splitting an order's money on delivery", () => {
  it("writes branch, courier and fee entries that add up to what was collected", async () => {
    const o = await quotedOrder("agent");
    await pay(o);
    await markOrderFulfilled(o.orderId, "admin-1");

    const rows = await entries(o.orderId);
    expect(rows.map((r) => [r.kind, r.amountTZS])).toEqual([
      ["branch_payout", 94_000],
      ["collected", 103_000],
      ["courier_payout", 2_500],
      ["malfleks_fee", 6_500],
    ]);
  });

  it("gives a brand-fleet order no courier entry", async () => {
    const o = await quotedOrder("brand");
    await pay(o);
    await markOrderFulfilled(o.orderId, "admin-1");
    const kinds = (await entries(o.orderId)).map((r) => r.kind);
    expect(kinds).not.toContain("courier_payout");
    expect(kinds).toContain("branch_payout");
  });

  it("writes nothing for an unpaid order, and splits it when the money arrives later", async () => {
    const o = await quotedOrder("agent");
    await markOrderFulfilled(o.orderId, "admin-1");
    expect((await entries(o.orderId)).length).toBe(0);

    await pay(o);
    const kinds = (await entries(o.orderId)).map((r) => r.kind);
    expect(kinds.sort()).toEqual(["branch_payout", "collected", "courier_payout", "malfleks_fee"]);
  });

  it("splits exactly once when delivery and payment land at the same moment", async () => {
    for (let i = 0; i < 5; i++) {
      const o = await quotedOrder("agent");
      await Promise.all([markOrderFulfilled(o.orderId, "admin-1"), pay(o)]);
      const rows = await entries(o.orderId);
      expect(rows.filter((r) => r.kind === "branch_payout")).toHaveLength(1);
      expect(rows.filter((r) => r.kind === "malfleks_fee")).toHaveLength(1);
    }
  });

  it("the manual button is idempotent", async () => {
    const o = await quotedOrder("agent");
    await pay(o);
    await markOrderFulfilled(o.orderId, "admin-1");
    await expect(accruePayoutsNow(o.orderId)).resolves.toBe("already-accrued");
    await expect(Promise.all([accruePayoutsNow(o.orderId), accruePayoutsNow(o.orderId)])).resolves.toEqual([
      "already-accrued",
      "already-accrued",
    ]);
    expect((await entries(o.orderId)).filter((r) => r.kind === "branch_payout")).toHaveLength(1);
  });
});

describe("payout batches", () => {
  it("draws up everything owed to one payee, then records it sent", async () => {
    const before = await moneyTotals();
    const a = await quotedOrder("agent");
    const b = await quotedOrder("agent");
    for (const o of [a, b]) {
      await pay(o);
      await markOrderFulfilled(o.orderId, "admin-1");
    }

    const owed = await listOwed();
    const branch = owed.payees.find((p) => p.payeeType === "branch" && p.payeeId === "toyota-dar");
    expect(branch).toBeDefined();
    expect(branch!.entries.map((e) => e.orderId)).toEqual(expect.arrayContaining([a.orderId, b.orderId]));

    const created = await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "admin-1");
    if (!created.ok) throw new Error(created.reason);
    expect(created.totalTZS).toBe(branch!.totalTZS);

    // Nothing left to claim for this payee, and nobody can claim it twice.
    await expect(createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "admin-1")).resolves.toEqual({
      ok: false,
      reason: "nothing-owed",
    });

    await expect(markPayoutPaid(created.batchId, "  ", "admin-1")).resolves.toEqual({ ok: false, reason: "bad-reference" });
    await expect(markPayoutPaid(created.batchId, "CPX123456", "admin-1")).resolves.toEqual({ ok: true });
    await expect(markPayoutPaid(created.batchId, "CPX999999", "admin-1")).resolves.toEqual({ ok: false, reason: "not-pending" });

    const after = await moneyTotals();
    expect(after.paidOutTZS - before.paidOutTZS).toBe(created.totalTZS);
    expect(after.heldTZS).toBe(after.collectedTZS - after.refundedTZS - after.paidOutTZS);
  });

  it("two tabs drawing up the same payee produce one batch", async () => {
    const o = await quotedOrder("agent");
    await pay(o);
    await markOrderFulfilled(o.orderId, "admin-1");

    const results = await Promise.all([
      createPayoutBatch({ payeeType: "agent", payeeId: "bolt-send" }, "admin-1"),
      createPayoutBatch({ payeeType: "agent", payeeId: "bolt-send" }, "admin-2"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const courierEntries = await getPrisma().ledgerEntry.findMany({ where: { kind: "courier_payout", order: { agentId: "bolt-send" } } });
    const batchIds = new Set(courierEntries.map((e) => e.payoutBatchId));
    // Every courier entry is in exactly one batch, and the batch totals match.
    for (const id of batchIds) {
      if (!id) continue;
      const batch = await getPrisma().payoutBatch.findUniqueOrThrow({ where: { id } });
      const sum = courierEntries.filter((e) => e.payoutBatchId === id).reduce((s, e) => s + e.amountTZS, 0);
      expect(batch.totalTZS).toBe(sum);
    }
  });

  it("a reference can't be used for two payouts", async () => {
    const o = await quotedOrder("brand");
    await pay(o);
    await markOrderFulfilled(o.orderId, "admin-1");
    const batch = await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "admin-1");
    if (!batch.ok) throw new Error(batch.reason);
    await expect(markPayoutPaid(batch.batchId, "CPX123456", "admin-1")).resolves.toEqual({ ok: false, reason: "reference-used" });
  });

  it("cancelling a payout makes what it covered owed again", async () => {
    const o = await quotedOrder("brand");
    await pay(o);
    await markOrderFulfilled(o.orderId, "admin-1");
    const batch = await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "admin-1");
    if (!batch.ok) throw new Error(batch.reason);

    const cancelled = await cancelPayoutBatch(batch.batchId, "Wrong number", "admin-1");
    expect(cancelled).toMatchObject({ ok: true });
    const row = await getPrisma().payoutBatch.findUniqueOrThrow({ where: { id: batch.batchId } });
    expect(row.status).toBe("failed");
    expect(row.failureNote).toContain("Wrong number");

    const again = await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "admin-1");
    expect(again).toMatchObject({ ok: true, totalTZS: batch.totalTZS });
    await expect(cancelPayoutBatch(batch.batchId, "again", "admin-1")).resolves.toEqual({ ok: false, reason: "not-pending" });
  });
});

describe("refunds", () => {
  it("records a refund on a cancelled paid order, never more than is held", async () => {
    const o = await quotedOrder("agent");
    await pay(o);
    await cancelOrder(o.orderId, "admin-1", "Out of stock");

    const work = await moneyWork();
    expect(work.refundsDue.map((r) => r.orderId)).toContain(o.orderId);

    await expect(recordRefund(o.orderId, o.total + 1, "RF123456", "admin-1")).resolves.toEqual({ ok: false, reason: "too-much" });
    await expect(recordRefund(o.orderId, 0, "RF123456", "admin-1")).resolves.toEqual({ ok: false, reason: "bad-amount" });
    await expect(recordRefund(o.orderId, 50_000, "RF123456", "admin-1")).resolves.toEqual({ ok: true });
    await expect(recordRefund(o.orderId, o.total - 50_000, "RF123457", "admin-1")).resolves.toEqual({ ok: true });
    await expect(recordRefund(o.orderId, 1, "RF123458", "admin-1")).resolves.toEqual({ ok: false, reason: "too-much" });

    expect((await moneyWork()).refundsDue.map((r) => r.orderId)).not.toContain(o.orderId);
  });

  it("refuses a refund on an order that isn't cancelled", async () => {
    const o = await quotedOrder("agent");
    await pay(o);
    await expect(recordRefund(o.orderId, 100, "RF999999", "admin-1")).resolves.toEqual({ ok: false, reason: "not-cancelled" });
  });
});
