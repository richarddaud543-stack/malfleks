// @vitest-environment node
//
// Real Postgres, a stand-in for ClickPesa. A mobile-money payout cannot be
// pulled back, so the property that matters above all others is that the same
// money is never sent twice -- whatever ClickPesa answers, however many runs
// overlap, and above all when nobody knows whether a request arrived.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const previewMobilePayout = vi.fn();
const createMobilePayout = vi.fn();
const queryPayoutStatus = vi.fn();
const getAccountBalance = vi.fn();
vi.mock("@/server/payments/clickpesa", () => ({
  previewMobilePayout: (input: unknown) => previewMobilePayout(input),
  createMobilePayout: (input: unknown) => createMobilePayout(input),
  queryPayoutStatus: (ref: string) => queryPayoutStatus(ref),
  getAccountBalance: () => getAccountBalance(),
}));

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createOrder } from "@/server/orders/create-order";
import { confirmDeliveryWithCode } from "@/server/orders/delivery-code";
import { confirmOrder } from "@/server/orders/status";
import { capturePayment } from "@/server/payments/settle";
import {
  AUTO_PAYOUT_ACTOR,
  autoPayoutStatus,
  compareBooksWithClickPesa,
  runAutoPayouts,
  sendRefFor,
  setAutoPayoutsPaused,
  settlePayoutFromProvider,
} from "./auto-payouts";
import { cancelPayoutBatch, createPayoutBatch, listOwed, markPayoutPaid, moneyTotals } from "./payouts";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("auto_payouts");
  await seedDatabase(getPrisma());
  // The shop's payout number: a real-shaped Tanzanian mobile number.
  await getPrisma().branch.update({ where: { id: "toyota-dar" }, data: { phone: "0754 000 111" } });
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const ON = { AUTO_PAYOUTS: "on" };
const NOW = new Date("2026-10-05T10:00:00Z");
const BRANCH = { branchId: "toyota-dar", agentId: null };
let sequence = 0;

beforeEach(async () => {
  const prisma = getPrisma();
  // Each test starts with empty books, so "what is owed" is only what it made.
  await prisma.ledgerEntry.deleteMany({});
  await prisma.payoutBatch.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.appSetting.deleteMany({});
  vi.clearAllMocks();
  previewMobilePayout.mockResolvedValue({ ok: true, feeTZS: 1_500, totalTZS: 95_500, balanceTZS: 500_000, receiverName: "TOYOTA DAR", provider: "MPESA TANZANIA" });
  createMobilePayout.mockResolvedValue({ ok: true, record: { status: "SUCCESS", id: "CPPAYOUT1", orderReference: null, feeTZS: 1_500 } });
  queryPayoutStatus.mockResolvedValue({ ok: true, found: false });
});

/** An order paid for and confirmed delivered with the customer's code: 94,000 owed to the shop. */
async function deliveredOrder(goodsTZS = 100_000, goodsFeeTZS = 6_000) {
  const created = await createOrder(
    { productId: "toyota-corolla", quantity: "1", fullName: "Asha Mwenda", phone: "0754123456", address: "Mikocheni B", agentId: null, reference: "", requestedAt: new Date().toISOString() },
    null,
  );
  if (!created.ok) throw new Error(created.reason);
  const prisma = getPrisma();
  await prisma.order.update({
    where: { id: created.value.id },
    data: { unitPriceTZS: goodsTZS, lineTotalTZS: goodsTZS, routeKind: "brand", agentId: null, quoteGoodsRungTZS: goodsFeeTZS, quoteDeliveryFeeTZS: 0, quoteDeliveryRungTZS: 0, quoteOrderTotalTZS: goodsTZS },
  });
  await confirmOrder(created.value.id, "admin-1");
  sequence += 1;
  const providerRef = `AUTO${sequence}X${Date.now()}`;
  await prisma.orderPayment.create({ data: { orderId: created.value.id, providerRef, provider: "clickpesa", amountTZS: goodsTZS } });
  await capturePayment({ providerRef, paymentReference: `CP${providerRef}`, collectedAmount: goodsTZS, source: "webhook" });
  const { code } = await prisma.deliveryCode.findUniqueOrThrow({ where: { orderId: created.value.id } });
  const delivered = await confirmDeliveryWithCode(created.value.id, BRANCH, "uid-partner", code);
  if (!delivered.ok) throw new Error(`fixture: ${delivered.reason}`);
  return created.value.id;
}

const batches = () => getPrisma().payoutBatch.findMany({ orderBy: { createdAt: "asc" } });
const owedTotal = async () => (await listOwed()).payees.reduce((sum, p) => sum + p.totalTZS, 0);

describe("when it is off", () => {
  it("sends nothing unless AUTO_PAYOUTS=on", async () => {
    await deliveredOrder();

    for (const env of [{}, { AUTO_PAYOUTS: "" }, { AUTO_PAYOUTS: "true" }, { AUTO_PAYOUTS: "off" }]) {
      const run = await runAutoPayouts(NOW, env);
      expect(run.skipped).toBe("off");
    }

    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(previewMobilePayout).not.toHaveBeenCalled();
    expect(await batches()).toEqual([]);
    expect(await owedTotal()).toBe(94_000);
  });

  it("sends nothing while an admin has it paused, and sends again once resumed", async () => {
    await deliveredOrder();
    await setAutoPayoutsPaused(true, "admin-1");

    expect((await runAutoPayouts(NOW, ON)).skipped).toBe("paused");
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(await autoPayoutStatus(NOW, ON)).toMatchObject({ armed: true, paused: true, active: false });

    await setAutoPayoutsPaused(false, "admin-1");
    expect((await runAutoPayouts(NOW, ON)).sent?.result).toBe("paid");
  });
});

describe("a clean send", () => {
  it("pays the shop its share once, to its number, and records ClickPesa's reference and fee", async () => {
    await deliveredOrder();

    const run = await runAutoPayouts(NOW, ON);

    expect(run.sent).toMatchObject({ amountTZS: 94_000, result: "paid" });
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    const sent = createMobilePayout.mock.calls[0][0];
    expect(sent).toMatchObject({ amountTZS: 94_000, phoneNumber: "255754000111" });
    expect(sent.orderReference).toMatch(/^P[A-Z0-9]+$/);

    const [batch] = await batches();
    expect(batch).toMatchObject({ status: "paid", totalTZS: 94_000, providerRef: "CPPAYOUT1", feeTZS: 1_500, createdBy: AUTO_PAYOUT_ACTOR, paidBy: AUTO_PAYOUT_ACTOR, sendRef: sent.orderReference });
    expect(await owedTotal()).toBe(0);
    expect(await moneyTotals()).toMatchObject({ collectedTZS: 100_000, paidOutTZS: 94_000, heldTZS: 6_000, feesEarnedTZS: 6_000, owedTZS: 0, inPayoutsTZS: 0 });
  });

  it("asks ClickPesa whether it would go before sending, with the same reference", async () => {
    await deliveredOrder();
    await runAutoPayouts(NOW, ON);
    expect(previewMobilePayout.mock.calls[0][0]).toEqual(createMobilePayout.mock.calls[0][0]);
    expect(previewMobilePayout.mock.invocationCallOrder[0]).toBeLessThan(createMobilePayout.mock.invocationCallOrder[0]);
  });

  it("sends nothing on a second run, because nothing is owed", async () => {
    await deliveredOrder();
    await runAutoPayouts(NOW, ON);
    const again = await runAutoPayouts(NOW, ON);
    expect(again.sent).toBeUndefined();
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
  });

  it("sends at most one payout per run -- ClickPesa allows one a minute", async () => {
    await deliveredOrder();
    await getPrisma().branch.update({ where: { id: "toyota-arusha" }, data: { phone: "0765000222" } });
    const second = await deliveredOrder();
    await getPrisma().order.update({ where: { id: second }, data: { branchId: "toyota-arusha" } });

    await runAutoPayouts(NOW, ON);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect((await listOwed()).payees).toHaveLength(1);
  });

  it("pays once when two runs start at the same moment", async () => {
    await deliveredOrder();

    await Promise.all([runAutoPayouts(NOW, ON), runAutoPayouts(NOW, ON), runAutoPayouts(NOW, ON)]);

    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect((await batches()).filter((b) => b.status === "paid")).toHaveLength(1);
    expect((await moneyTotals()).paidOutTZS).toBe(94_000);
  });
});

describe("when nobody knows whether the request arrived", () => {
  it("holds the payout as 'sending' and never sends it again", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "unknown", detail: "The operation timed out" });

    const first = await runAutoPayouts(NOW, ON);
    expect(first.sent?.result).toBe("unknown");
    const [batch] = await batches();
    expect(batch).toMatchObject({ status: "sending", sendRef: sendRefFor(batch.id) });
    expect(batch.sendStartedAt).not.toBeNull();
    // The money is neither owed nor paid: it is in a payout that may have gone.
    expect(await owedTotal()).toBe(0);
    expect(await moneyTotals()).toMatchObject({ paidOutTZS: 0, inPayoutsTZS: 94_000 });

    // Later runs ask ClickPesa by reference. It has no record yet -- and "not
    // found" is not proof it never arrived, so nothing is re-sent.
    await runAutoPayouts(NOW, ON);
    await runAutoPayouts(NOW, ON);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect(queryPayoutStatus).toHaveBeenCalledWith(batch.sendRef);
    expect((await batches())[0].status).toBe("sending");
  });

  it("marks it paid when ClickPesa later says it went", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "unknown" });
    await runAutoPayouts(NOW, ON);

    queryPayoutStatus.mockResolvedValueOnce({ ok: true, found: true, record: { status: "SUCCESS", id: "CPLATE", orderReference: null, feeTZS: 1_500 } });
    const run = await runAutoPayouts(NOW, ON);

    expect(run.settled).toEqual([expect.objectContaining({ outcome: "paid" })]);
    expect((await batches())[0]).toMatchObject({ status: "paid", providerRef: "CPLATE" });
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
  });

  it("treats a 'reference already used' answer as possibly sent, not as a refusal", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "duplicate-reference" });
    await runAutoPayouts(NOW, ON);
    expect((await batches())[0].status).toBe("sending");
    expect(await owedTotal()).toBe(0);
  });

  it("settles in-flight payouts even when sending is switched off", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValueOnce({ ok: true, record: { status: "PROCESSING", id: "CPSLOW", orderReference: null, feeTZS: null } });
    expect((await runAutoPayouts(NOW, ON)).sent?.result).toBe("sending");

    queryPayoutStatus.mockResolvedValueOnce({ ok: true, found: true, record: { status: "SUCCESS", id: "CPSLOW", orderReference: null, feeTZS: 1_500 } });
    const run = await runAutoPayouts(NOW, {});
    expect(run.skipped).toBe("off");
    expect((await batches())[0].status).toBe("paid");
  });

  it("lets an admin settle a stuck one either way from the Payouts page", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValue({ ok: false, reason: "unknown" });
    await runAutoPayouts(NOW, ON);
    const [stuck] = await batches();

    await expect(markPayoutPaid(stuck.id, "CPFOUNDBYHAND", "admin-1")).resolves.toEqual({ ok: true });
    expect((await batches())[0]).toMatchObject({ status: "paid", providerRef: "CPFOUNDBYHAND", paidBy: "admin-1" });

    await deliveredOrder();
    await runAutoPayouts(NOW, ON);
    const second = (await batches()).find((b) => b.status === "sending")!;
    await expect(cancelPayoutBatch(second.id, "ClickPesa shows no such payout", "admin-1")).resolves.toMatchObject({ ok: true });
    expect(await owedTotal()).toBe(94_000);
  });
});

describe("when ClickPesa says no", () => {
  it("cancels the payout and leaves the money owed when the preview is refused", async () => {
    await deliveredOrder();
    previewMobilePayout.mockResolvedValueOnce({ ok: false, reason: "refused", status: 400, detail: "Insufficient balance: available balance is 100 TZS" });

    const run = await runAutoPayouts(NOW, ON);

    expect(run.sent?.result).toBe("insufficient-balance");
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect((await batches())[0]).toMatchObject({ status: "failed", sendRef: null });
    expect(await owedTotal()).toBe(94_000);
  });

  it("does not send when ClickPesa's balance cannot cover the payout and its fee", async () => {
    await deliveredOrder();
    previewMobilePayout.mockResolvedValueOnce({ ok: true, feeTZS: 1_500, totalTZS: 95_500, balanceTZS: 95_000, receiverName: null, provider: null });

    expect((await runAutoPayouts(NOW, ON)).sent?.result).toBe("insufficient-balance");
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(await owedTotal()).toBe(94_000);
  });

  it("puts the money back to owed when the send itself is refused", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "refused", status: 400, detail: "Please wait 42 seconds" });

    expect((await runAutoPayouts(NOW, ON)).sent?.result).toBe("refused");
    expect((await batches())[0].status).toBe("failed");
    expect(await owedTotal()).toBe(94_000);
  });

  it("does not try the same partner again straight after a failure", async () => {
    await deliveredOrder();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "refused", status: 400, detail: "Invalid phone number" });
    await runAutoPayouts(NOW, ON);

    const next = await runAutoPayouts(new Date(NOW.getTime() + 60 * 60_000), ON);
    expect(next.sent).toBeUndefined();
    expect(next.leftForAdmin).toEqual([expect.objectContaining({ reason: "recently-failed" })]);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);

    // A day later it may be tried again.
    const nextDay = await runAutoPayouts(new Date(Date.now() + 25 * 3_600_000), ON);
    expect(nextDay.sent?.result).toBe("paid");
  });

  it("puts the money back to owed when a payout reported as sent is reversed afterwards", async () => {
    await deliveredOrder();
    await runAutoPayouts(NOW, ON);
    const [paid] = await batches();
    expect(paid.status).toBe("paid");

    const settled = await settlePayoutFromProvider(paid.sendRef!, { status: "REVERSED", id: "CPPAYOUT1", orderReference: paid.sendRef, feeTZS: null });

    expect(settled.outcome).toBe("returned");
    expect((await batches())[0]).toMatchObject({ status: "failed", providerRef: null, paidAt: null });
    expect(await owedTotal()).toBe(94_000);
    expect((await moneyTotals()).paidOutTZS).toBe(0);
  });

  it("ignores a payout notice for a reference that is not one of ours", async () => {
    await expect(settlePayoutFromProvider("SOMEONEELSE", { status: "SUCCESS", id: "X", orderReference: "SOMEONEELSE", feeTZS: null })).resolves.toEqual({ outcome: "not-ours", batchId: null });
  });
});

describe("what it leaves for a person", () => {
  it("a partner with no mobile number on file", async () => {
    await deliveredOrder();
    await getPrisma().branch.update({ where: { id: "toyota-dar" }, data: { phone: "022 211 0000" } });
    try {
      const run = await runAutoPayouts(NOW, ON);
      expect(run.sent).toBeUndefined();
      expect(run.leftForAdmin).toEqual([expect.objectContaining({ reason: "no-mobile-number", amountTZS: 94_000 })]);
      expect(await batches()).toEqual([]);
    } finally {
      await getPrisma().branch.update({ where: { id: "toyota-dar" }, data: { phone: "0754 000 111" } });
    }
  });

  it("an amount under ClickPesa's minimum", async () => {
    await deliveredOrder(5_574, 4_000); // 1,574 owed
    const run = await runAutoPayouts(NOW, ON);
    expect(run.leftForAdmin).toEqual([expect.objectContaining({ reason: "below-minimum" })]);
    expect(createMobilePayout).not.toHaveBeenCalled();
  });

  it("an amount over the per-payout ceiling", async () => {
    await deliveredOrder();
    const run = await runAutoPayouts(NOW, { ...ON, AUTO_PAYOUT_MAX_TZS: "50000" });
    expect(run.leftForAdmin).toEqual([expect.objectContaining({ reason: "above-ceiling" })]);
    expect(createMobilePayout).not.toHaveBeenCalled();
  });

  it("anything past the day's ceiling", async () => {
    const env = { ...ON, AUTO_PAYOUT_DAILY_MAX_TZS: "100000" };
    const today = new Date();
    await deliveredOrder();
    expect((await runAutoPayouts(today, env)).sent?.result).toBe("paid");

    await deliveredOrder();
    const run = await runAutoPayouts(today, env);
    expect(run.leftForAdmin).toEqual([expect.objectContaining({ reason: "daily-ceiling" })]);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect((await autoPayoutStatus(today, env)).sentTodayTZS).toBe(94_000);
  });

  it("a partner an admin has already drawn a payout up for", async () => {
    await deliveredOrder();
    await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "admin-1");
    await deliveredOrder();

    const run = await runAutoPayouts(NOW, ON);
    expect(run.sent).toBeUndefined();
    expect(createMobilePayout).not.toHaveBeenCalled();
  });
});

describe("the books against the real balance", () => {
  it("reports what ClickPesa holds beside what the ledger says it should", async () => {
    await deliveredOrder();
    getAccountBalance.mockResolvedValueOnce({ ok: true, balanceTZS: 99_000 });
    await expect(compareBooksWithClickPesa()).resolves.toEqual({ ok: true, clickpesaTZS: 99_000, booksTZS: 100_000, differenceTZS: -1_000 });
  });

  it("says so when the balance cannot be read", async () => {
    getAccountBalance.mockResolvedValueOnce({ ok: false, reason: "auth-failed", detail: "HTTP 403" });
    await expect(compareBooksWithClickPesa()).resolves.toEqual({ ok: false, reason: "HTTP 403" });
  });
});
