// @vitest-environment node
//
// Real Postgres, a stand-in for ClickPesa. A refund is a mobile-money payout
// and cannot be pulled back, so the property that matters above all others is
// the one `auto-payouts.integration.test.ts` holds for partners: the same
// money is never sent twice -- whatever ClickPesa answers, however many runs
// overlap, and above all when nobody knows whether a request arrived.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const previewMobilePayout = vi.fn();
const createMobilePayout = vi.fn();
const queryPayoutStatus = vi.fn();
vi.mock("@/server/payments/clickpesa", () => ({
  previewMobilePayout: (input: unknown) => previewMobilePayout(input),
  createMobilePayout: (input: unknown) => createMobilePayout(input),
  queryPayoutStatus: (ref: string) => queryPayoutStatus(ref),
  getAccountBalance: vi.fn(),
}));

const sendCustomerEmail = vi.fn();
const sendNotification = vi.fn();
vi.mock("@/server/notify/email", async (original) => ({
  ...(await original<typeof import("@/server/notify/email")>()),
  sendCustomerEmail: (...args: unknown[]) => sendCustomerEmail(...args),
  sendPartnerEmail: vi.fn(async () => ({ sent: true })),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { notifyOrderCancelled } from "@/server/notify/events";
import { cancelOrder, cancelPaidOrderByRule, declineOrder } from "@/server/orders/status";
import { paidOrder, PAYER, resetRulebookTables, shopUser } from "@/server/rules/fixtures.test-helper";
import { HOUR_MS } from "@/server/rules/thresholds";
import { runAutoPayouts, setAutoPayoutsPaused } from "./auto-payouts";
import { moneyTotals, moneyWork, recordRefund, refundableFor } from "./payouts";
import { allowRefundRetry, applyRefundAnswer, refundRefFor, refundWillBeAutomatic, runAutoRefunds } from "./refund-send";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("refund_send");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const ON = { AUTO_PAYOUTS: "on" };
const NOW = new Date("2026-10-10T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR_MS);

/** What every order in this file costs, and so what a full refund of one is. */
const ORDER_TZS = 50_000;
/** ClickPesa's stand-in answers: its fee, what it holds, and the id it gives a payout. */
const FEE_TZS = 1_000;
const BALANCE_TZS = 500_000;
const CLICKPESA_ID = "CPREFUND1";
const CUSTOMER_EMAIL = "asha@example.com";

/**
 * A paid order, with the emails its payment sent (receipt, "you have been
 * paid") cleared away, so a test that counts emails counts only the refund's.
 */
async function paid(at: Date, options: Parameters<typeof paidOrder>[1] = {}) {
  const order = await paidOrder(at, { totalTZS: ORDER_TZS, ...options });
  sendCustomerEmail.mockClear();
  sendNotification.mockClear();
  return order;
}

beforeEach(async () => {
  await resetRulebookTables();
  vi.clearAllMocks();
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
  previewMobilePayout.mockResolvedValue({ ok: true, feeTZS: FEE_TZS, totalTZS: ORDER_TZS + FEE_TZS, balanceTZS: BALANCE_TZS, receiverName: "ASHA MWENDA", provider: "MPESA TANZANIA" });
  createMobilePayout.mockResolvedValue({ ok: true, record: { status: "SUCCESS", id: CLICKPESA_ID, orderReference: null, feeTZS: FEE_TZS } });
  queryPayoutStatus.mockResolvedValue({ ok: true, found: false });
});

const refunds = () => getPrisma().refundSend.findMany({ orderBy: { createdAt: "asc" } });
const refundEntries = (orderId: string) => getPrisma().ledgerEntry.findMany({ where: { orderId, kind: "refund" }, orderBy: { createdAt: "asc" } });
const alerts = () => getPrisma().ownerAlert.findMany({ orderBy: { createdAt: "asc" } });

/** A paid order the rulebook then cancelled for lateness: the plainest case for an automatic refund. */
async function lateCancelled(options: Parameters<typeof paidOrder>[1] = {}) {
  const order = await paid(hoursAgo(130), options);
  const outcome = await cancelPaidOrderByRule(order.id, "Not delivered within 5 days of payment");
  if (!outcome.ok) throw new Error(`fixture: ${outcome.reason}`);
  return order;
}

describe("when it is off", () => {
  it("sends nothing unless AUTO_PAYOUTS=on, and nothing while paused", async () => {
    const order = await lateCancelled();

    expect((await runAutoRefunds(NOW, {})).skipped).toBe("off");
    await setAutoPayoutsPaused(true, "admin-1");
    expect((await runAutoRefunds(NOW, ON)).skipped).toBe("paused");

    expect(previewMobilePayout).not.toHaveBeenCalled();
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(await refunds()).toEqual([]);
    expect(await refundableFor(getPrisma(), order.id)).toBe(ORDER_TZS);
    expect(await refundWillBeAutomatic(order.id, NOW, {})).toBe(false);
  });
});

describe("a clean refund", () => {
  it("sends the full amount once, to the wallet that paid, and only then writes the books", async () => {
    const order = await lateCancelled();

    const run = await runAutoRefunds(NOW, ON);

    expect(run.sent).toMatchObject({ reference: order.reference, amountTZS: ORDER_TZS, result: "sent" });
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    const [row] = await refunds();
    expect(createMobilePayout).toHaveBeenCalledWith({ amountTZS: ORDER_TZS, phoneNumber: PAYER, orderReference: refundRefFor(row.id) });
    expect(row).toMatchObject({ status: "sent", reason: "deadline", amountTZS: ORDER_TZS, phone: PAYER, providerRef: CLICKPESA_ID, feeTZS: FEE_TZS, openOrderId: null });

    const entries = await refundEntries(order.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ amountTZS: ORDER_TZS, note: `Refund ${CLICKPESA_ID} · sent automatically` });
    expect(await refundableFor(getPrisma(), order.id)).toBe(0);
    expect((await moneyTotals()).heldTZS).toBe(0);
    expect((await moneyWork()).refundsDue).toEqual([]);
  });

  it("tells the customer, once, with ClickPesa's reference", async () => {
    await lateCancelled();
    await runAutoRefunds(NOW, ON);

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe(CUSTOMER_EMAIL);
    expect(subject).toContain("Refund sent");
    expect(body).toContain(CLICKPESA_ID);
    expect(body).toContain("TSh 50,000");
  });

  it("does nothing the second time", async () => {
    await lateCancelled();
    await runAutoRefunds(NOW, ON);
    vi.clearAllMocks();

    const again = await runAutoRefunds(NOW, ON);

    expect(again.sent).toBeUndefined();
    expect(previewMobilePayout).not.toHaveBeenCalled();
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(await refunds()).toHaveLength(1);
  });

  it("refunds a shop's own decline of a paid order", async () => {
    const order = await paid(hoursAgo(5));
    const { uid } = await shopUser();
    await declineOrder(order.id, uid, "Out of stock");

    const run = await runAutoRefunds(NOW, ON);

    expect(run.sent?.result).toBe("sent");
    expect((await refunds())[0].reason).toBe("shop-declined");
  });

  it("refunds a payment that landed after the order was already cancelled", async () => {
    // Cancelled by an admin yesterday; the customer paid on the old link this morning.
    const order = await paid(hoursAgo(2));
    await cancelOrder(order.id, "admin-1", "Customer asked");
    await getPrisma().order.update({ where: { id: order.id }, data: { decidedAt: hoursAgo(20) } });

    const run = await runAutoRefunds(NOW, ON);

    expect(run.sent?.result).toBe("sent");
    expect((await refunds())[0].reason).toBe("paid-after-cancel");
  });
});

describe("what waits for a person", () => {
  it("an order an admin cancelled is not refunded automatically", async () => {
    const order = await paid(hoursAgo(30));
    await cancelOrder(order.id, "admin-1", "Customer changed their mind");

    const run = await runAutoRefunds(NOW, ON);

    expect(run.sent).toBeUndefined();
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(await refunds()).toEqual([]);
    // It is where it always was: in the owner's "Refunds to send".
    expect((await moneyWork()).refundsDue.map((r) => r.orderId)).toEqual([order.id]);
    expect(await refundWillBeAutomatic(order.id, NOW, ON)).toBe(false);
  });

  it("money somebody has already touched by hand is left alone", async () => {
    const order = await lateCancelled();
    expect(await recordRefund(order.id, 10_000, "MPESA-PART-1", "admin-1")).toEqual({ ok: true });

    const run = await runAutoRefunds(NOW, ON);

    expect(run.sent).toBeUndefined();
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(await refundableFor(getPrisma(), order.id)).toBe(40_000);
  });

  it("tells the owner once when the paying wallet is not known", async () => {
    const order = await lateCancelled({ payerPhone: null });

    await runAutoRefunds(NOW, ON);
    await runAutoRefunds(NOW, ON);

    expect(createMobilePayout).not.toHaveBeenCalled();
    const raised = await alerts();
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ key: "refund-needs-owner", urgency: "urgent", href: `/admin/orders/${order.id}` });
    expect(raised[0].body).toContain("does not know which mobile-money number paid");
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("keeps to the per-send and daily ceilings, which it shares with partner payouts", async () => {
    await lateCancelled();

    const tooBig = await runAutoRefunds(NOW, { ...ON, AUTO_PAYOUT_MAX_TZS: "40000" });
    expect(tooBig.sent).toBeUndefined();
    expect(tooBig.leftForOwner.map((l) => l.reason)).toEqual(["above-ceiling"]);

    await getPrisma().ownerAlert.deleteMany({});
    // 30,000 already went out today as a payout: 30,000 + 50,000 is over 60,000.
    await getPrisma().payoutBatch.create({ data: { payeeType: "branch", payeeId: "toyota-dar", totalTZS: 30_000, status: "paid", sendRef: "PX1", sendStartedAt: hoursAgo(1) } });
    const overDay = await runAutoRefunds(NOW, { ...ON, AUTO_PAYOUT_DAILY_MAX_TZS: "60000" });
    expect(overDay.sent).toBeUndefined();
    expect(createMobilePayout).not.toHaveBeenCalled();
    // Tomorrow's business, not the owner's: no alert.
    expect(await alerts()).toEqual([]);
  });
});

describe("at the edges", () => {
  it("does nothing, and asks ClickPesa nothing, when there is nothing to refund", async () => {
    const run = await runAutoRefunds(NOW, ON);

    expect(run).toEqual({ settled: [], leftForOwner: [] });
    expect(previewMobilePayout).not.toHaveBeenCalled();
    expect(queryPayoutStatus).not.toHaveBeenCalled();
  });

  it("sends a refund that is exactly the per-send ceiling", async () => {
    await lateCancelled();

    const run = await runAutoRefunds(NOW, { ...ON, AUTO_PAYOUT_MAX_TZS: String(ORDER_TZS) });

    expect(run.sent?.result).toBe("sent");
  });

  it("holds back a refund one shilling over the per-send ceiling", async () => {
    await lateCancelled();

    const run = await runAutoRefunds(NOW, { ...ON, AUTO_PAYOUT_MAX_TZS: String(ORDER_TZS - 1) });

    expect(run.sent).toBeUndefined();
    expect(createMobilePayout).not.toHaveBeenCalled();
  });

  it("sends a refund that brings the day exactly to its ceiling, and not one shilling past it", async () => {
    const alreadySent = 30_000;
    await getPrisma().payoutBatch.create({ data: { payeeType: "branch", payeeId: "toyota-dar", totalTZS: alreadySent, status: "paid", sendRef: "PEDGE1", sendStartedAt: hoursAgo(1) } });
    await lateCancelled();

    const over = await runAutoRefunds(NOW, { ...ON, AUTO_PAYOUT_DAILY_MAX_TZS: String(alreadySent + ORDER_TZS - 1) });
    expect(over.sent).toBeUndefined();

    const exact = await runAutoRefunds(NOW, { ...ON, AUTO_PAYOUT_DAILY_MAX_TZS: String(alreadySent + ORDER_TZS) });
    expect(exact.sent?.result).toBe("sent");
  });

  it.each([
    ["an empty string", ""],
    ["a number that is not a Tanzanian mobile", "+1 415 555 0100"],
    ["something that is not a number at all", "MPESA"],
  ])("treats %s as no wallet number, and leaves the refund for the owner", async (_name, payerPhone) => {
    await lateCancelled({ payerPhone });

    const run = await runAutoRefunds(NOW, ON);

    expect(run.sent).toBeUndefined();
    expect(run.leftForOwner.map((l) => l.reason)).toEqual(["no-number"]);
    expect(createMobilePayout).not.toHaveBeenCalled();
  });

  it("leaves a refund under ClickPesa's minimum for the owner", async () => {
    await lateCancelled({ totalTZS: 2_499 });

    const run = await runAutoRefunds(NOW, ON);

    expect(run.leftForOwner.map((l) => l.reason)).toEqual(["below-minimum"]);
    expect(createMobilePayout).not.toHaveBeenCalled();
  });
});

describe("never twice", () => {
  it("does not send again when nobody knows whether the first request arrived", async () => {
    const order = await lateCancelled();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "unknown", detail: "socket hang up" });

    const first = await runAutoRefunds(NOW, ON);
    expect(first.sent?.result).toBe("unknown");
    const [row] = await refunds();
    expect(row.status).toBe("sending");

    // Three more runs while ClickPesa says nothing about that reference.
    for (let i = 0; i < 3; i += 1) await runAutoRefunds(new Date(NOW.getTime() + (i + 1) * 15 * 60_000), ON);

    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect(await refunds()).toHaveLength(1);
    expect(await refundEntries(order.id)).toEqual([]);
    // And an admin cannot record a second refund of the same money meanwhile.
    expect(await refundableFor(getPrisma(), order.id)).toBe(0);
    expect(await recordRefund(order.id, ORDER_TZS, "MPESA-BY-HAND", "admin-1")).toEqual({ ok: false, reason: "too-much" });
    expect((await moneyWork()).refundsDue).toEqual([]);
  });

  it("finishes the record when ClickPesa later says it arrived", async () => {
    const order = await lateCancelled();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "unknown" });
    await runAutoRefunds(NOW, ON);
    const [row] = await refunds();
    queryPayoutStatus.mockResolvedValue({ ok: true, found: true, record: { status: "SUCCESS", id: "CPLATE", orderReference: row.sendRef, feeTZS: 900 } });

    const next = await runAutoRefunds(new Date(NOW.getTime() + 15 * 60_000), ON);

    expect(next.settled).toEqual([{ refundSendId: row.id, outcome: "sent" }]);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect((await refundEntries(order.id)).map((e) => e.amountTZS)).toEqual([ORDER_TZS]);
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });

  it("two runs at the same moment send one refund", async () => {
    await lateCancelled();

    const runs = await Promise.all([runAutoRefunds(NOW, ON), runAutoRefunds(NOW, ON), runAutoRefunds(NOW, ON)]);

    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect(await refunds()).toHaveLength(1);
    expect(runs.filter((r) => r.sent?.result === "sent")).toHaveLength(1);
  });

  it("applies the same answer delivered twice exactly once", async () => {
    const order = await lateCancelled();
    createMobilePayout.mockResolvedValueOnce({ ok: true, record: { status: "PROCESSING", id: null, orderReference: null, feeTZS: null } });
    await runAutoRefunds(NOW, ON);
    const [row] = await refunds();
    const record = { status: "SUCCESS", id: "CPHOOK", orderReference: row.sendRef, feeTZS: FEE_TZS };

    expect(await applyRefundAnswer(row.sendRef!, record)).toBe("sent");
    expect(await applyRefundAnswer(row.sendRef!, record)).toBe("still-sending");

    expect(await refundEntries(order.id)).toHaveLength(1);
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    expect(await applyRefundAnswer("PNOTAREFUND", record)).toBe("not-ours");
  });

  it("does not try a refused refund again, and tells the owner why", async () => {
    const order = await lateCancelled();
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "refused", status: 400, detail: "Invalid phone number" });

    const first = await runAutoRefunds(NOW, ON);
    await runAutoRefunds(new Date(NOW.getTime() + 15 * 60_000), ON);
    await runAutoRefunds(new Date(NOW.getTime() + 30 * 60_000), ON);

    expect(first.sent?.result).toBe("refused");
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect((await refunds()).map((r) => r.status)).toEqual(["failed"]);
    expect(await refundEntries(order.id)).toEqual([]);
    // The money is the owner's to send again, and he has been told once.
    expect((await moneyWork()).refundsDue.map((r) => r.orderId)).toEqual([order.id]);
    const raised = await alerts();
    expect(raised).toHaveLength(1);
    expect(raised[0].body).toContain("Invalid phone number");
  });
});

describe("when the money comes back", () => {
  it("a refund that bounced before arriving leaves the books untouched", async () => {
    const order = await lateCancelled();
    createMobilePayout.mockResolvedValueOnce({ ok: true, record: { status: "PROCESSING", id: null, orderReference: null, feeTZS: null } });
    await runAutoRefunds(NOW, ON);
    const [row] = await refunds();

    expect(await applyRefundAnswer(row.sendRef!, { status: "FAILED", id: null, orderReference: row.sendRef, feeTZS: null })).toBe("failed");

    expect(await refundEntries(order.id)).toEqual([]);
    expect(await refundableFor(getPrisma(), order.id)).toBe(ORDER_TZS);
    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect((await alerts()).map((a) => a.key)).toEqual(["refund-needs-owner"]);
  });

  it("a refund reversed after it was reported sent is undone in the books by a second entry, never an edit", async () => {
    const order = await lateCancelled();
    await runAutoRefunds(NOW, ON);
    const [row] = await refunds();
    expect(await refundableFor(getPrisma(), order.id)).toBe(0);

    expect(await applyRefundAnswer(row.sendRef!, { status: "REVERSED", id: CLICKPESA_ID, orderReference: row.sendRef, feeTZS: null })).toBe("returned");

    expect((await refundEntries(order.id)).map((e) => e.amountTZS)).toEqual([ORDER_TZS, -ORDER_TZS]);
    expect(await refundableFor(getPrisma(), order.id)).toBe(ORDER_TZS);
    expect((await moneyTotals()).heldTZS).toBe(ORDER_TZS);
    expect((await refunds())[0].status).toBe("returned");
    expect((await alerts()).map((a) => a.urgency)).toEqual(["urgent"]);
    // And it is not tried again by itself.
    vi.clearAllMocks();
    await runAutoRefunds(new Date(NOW.getTime() + HOUR_MS), ON);
    expect(createMobilePayout).not.toHaveBeenCalled();
  });
});

describe("trying again", () => {
  it("ClickPesa being unreachable leaves no trace and is simply tried on the next pass", async () => {
    await lateCancelled();
    previewMobilePayout.mockResolvedValueOnce({ ok: false, reason: "request-failed", detail: "timeout" });

    const first = await runAutoRefunds(NOW, ON);
    expect(first.sent?.result).toBe("try-later");
    expect(await refunds()).toEqual([]);
    expect(await alerts()).toEqual([]);

    const second = await runAutoRefunds(new Date(NOW.getTime() + 15 * 60_000), ON);
    expect(second.sent?.result).toBe("sent");
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
  });

  it("the owner can allow a retry of a refund that never left -- and only of one that never left", async () => {
    const order = await lateCancelled();
    previewMobilePayout.mockResolvedValueOnce({ ok: false, reason: "refused", status: 400, detail: "Insufficient balance" });
    await runAutoRefunds(NOW, ON);
    expect((await refunds())[0]).toMatchObject({ status: "failed", sendStartedAt: null });

    expect(await allowRefundRetry(order.id)).toBe(true);
    const retried = await runAutoRefunds(new Date(NOW.getTime() + HOUR_MS), ON);
    expect(retried.sent?.result).toBe("sent");

    // That one left MalFleks. If it later bounces, a retry is not on offer.
    const [row] = await refunds();
    await applyRefundAnswer(row.sendRef!, { status: "REVERSED", id: null, orderReference: row.sendRef, feeTZS: null });
    expect(await allowRefundRetry(order.id)).toBe(false);
  });
});

describe("a refund and a payout in the same minute", () => {
  it("a payout waits for the next run when a refund has just gone", async () => {
    await lateCancelled();
    await runAutoRefunds(NOW, ON);
    // Something is owed to the shop too.
    const delivered = await paid(hoursAgo(3));
    await getPrisma().ledgerEntry.create({ data: { orderId: delivered.id, kind: "branch_payout", amountTZS: 47_000 } });
    await getPrisma().branch.update({ where: { id: "toyota-dar" }, data: { phone: "0754 000 111" } });
    await getPrisma().refundSend.updateMany({ data: { sendStartedAt: new Date(NOW.getTime() - 20_000) } });
    vi.clearAllMocks();

    const tooSoon = await runAutoPayouts(NOW, ON);
    expect(tooSoon.sent).toBeUndefined();
    expect(createMobilePayout).not.toHaveBeenCalled();

    const later = await runAutoPayouts(new Date(NOW.getTime() + 2 * 60_000), ON);
    expect(later.sent?.result).toBe("paid");
  });
});

describe("what the owner is told when a paid order is cancelled", () => {
  it("is told NOT to refund by hand when the site will do it", async () => {
    const order = await lateCancelled();
    const previous = process.env.AUTO_PAYOUTS;
    process.env.AUTO_PAYOUTS = "on";
    try {
      await notifyOrderCancelled(order.id);
    } finally {
      if (previous === undefined) delete process.env.AUTO_PAYOUTS;
      else process.env.AUTO_PAYOUTS = previous;
    }

    const [subject, body] = sendNotification.mock.calls[0];
    expect(subject).toContain("the refund is automatic");
    expect(body).toContain("Do NOT send it from ClickPesa as well");
  });

  it("is asked to send it, as before, when the site will not", async () => {
    const order = await paid(hoursAgo(30));
    await cancelOrder(order.id, "admin-1", "Customer changed their mind");
    await notifyOrderCancelled(order.id);

    const [subject, body] = sendNotification.mock.calls[0];
    expect(subject).toContain("refund due");
    expect(body).toContain("Send the refund from");
  });
});
