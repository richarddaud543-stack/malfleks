// @vitest-environment node
//
// Real Postgres. The promise under test is the one on the front page: the
// seller is paid only after the customer has the goods. Since 5 Oct 2026 that
// means "only after the customer's code was entered", so what matters is what
// the *database* allows: no delivery without the code, no way for a partner to
// read the code, no way to guess it at speed, and one delivery however many
// phones enter it at once.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { capturePayment } from "@/server/payments/settle";
import { createOrder } from "./create-order";
import {
  confirmDeliveryWithCode,
  DELIVERY_CODE_NOTE,
  deliveryCodesForCustomer,
  deliveryProblemWork,
  ensureDeliveryCode,
  PAUSE_MINUTES,
  reportDeliveryProblem,
  WRONG_BEFORE_LOCK,
  WRONG_BEFORE_PAUSE,
} from "./delivery-code";
import { listOrders } from "./list-orders";
import { cancelOrder, confirmOrder, markOrderFulfilled, orderHistory } from "./status";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("delivery_code");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const BRANCH = { branchId: "toyota-dar", agentId: null };
const COURIER = { branchId: null, agentId: "bolt-send" };
const PARTNER_UID = "uid-partner";
let sequence = 0;

/** A confirmed order with a real quote and an open payment link, as the live flow leaves it. */
async function quotedOrder({ route = "brand" as "brand" | "agent", customerId = null as string | null } = {}) {
  const created = await createOrder(
    { productId: "toyota-corolla", quantity: "1", fullName: "Asha Mwenda", phone: "0754123456", address: "Mikocheni B", agentId: null, reference: "", requestedAt: new Date().toISOString() },
    customerId,
  );
  if (!created.ok) throw new Error(created.reason);
  const prisma = getPrisma();
  const agent = route === "agent";
  const total = agent ? 103_000 : 100_000;
  await prisma.order.update({
    where: { id: created.value.id },
    data: {
      customerId,
      unitPriceTZS: 100_000,
      lineTotalTZS: 100_000,
      routeKind: route,
      agentId: agent ? "bolt-send" : null,
      quoteGoodsRungTZS: 6_000,
      quoteDeliveryFeeTZS: agent ? 3_000 : 0,
      quoteDeliveryRungTZS: agent ? 500 : 0,
      quoteOrderTotalTZS: total,
    },
  });
  await confirmOrder(created.value.id, "admin-1");
  sequence += 1;
  const providerRef = `DCODE${sequence}X${Date.now()}`;
  await prisma.orderPayment.create({ data: { orderId: created.value.id, providerRef, provider: "clickpesa", amountTZS: total } });
  return { orderId: created.value.id, reference: created.value.reference, providerRef, total };
}

async function paidOrder(options: Parameters<typeof quotedOrder>[0] = {}) {
  const order = await quotedOrder(options);
  const outcome = await capturePayment({ providerRef: order.providerRef, paymentReference: `CP${order.providerRef}`, collectedAmount: order.total, source: "webhook" });
  if (outcome !== "captured") throw new Error(`fixture: ${outcome}`);
  const row = await getPrisma().deliveryCode.findUniqueOrThrow({ where: { orderId: order.orderId } });
  return { ...order, code: row.code };
}

const wrongCodeFor = (code: string) => (code === "000000" ? "000001" : "000000");
const status = async (orderId: string) => (await getPrisma().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })).status;
const ledgerKinds = async (orderId: string) =>
  (await getPrisma().ledgerEntry.findMany({ where: { orderId }, orderBy: { kind: "asc" }, select: { kind: true } })).map((e) => e.kind);

describe("a paid order gets a code", () => {
  it("creates the code in the same step that records the payment", async () => {
    const order = await paidOrder();
    expect(order.code).toMatch(/^\d{6}$/);
  });

  it("has none before it is paid for", async () => {
    const order = await quotedOrder();
    expect(await getPrisma().deliveryCode.findUnique({ where: { orderId: order.orderId } })).toBeNull();
  });

  it("keeps the same code however many times it is asked for", async () => {
    const order = await paidOrder();
    const again = await Promise.all([ensureDeliveryCode(getPrisma(), order.orderId), ensureDeliveryCode(getPrisma(), order.orderId)]);
    expect(again).toEqual([order.code, order.code]);
  });
});

describe("who can see the code", () => {
  it("shows a customer the codes for their own paid orders, by reference", async () => {
    const mine = await paidOrder({ customerId: "cust-a" });
    const theirs = await paidOrder({ customerId: "cust-b" });

    const codes = await deliveryCodesForCustomer("cust-a");
    expect(codes.get(mine.reference)).toBe(mine.code);
    expect(codes.has(theirs.reference)).toBe(false);
  });

  it("does not show a code for an order that is not paid, delivered, or cancelled", async () => {
    const unpaid = await quotedOrder({ customerId: "cust-c" });
    const delivered = await paidOrder({ customerId: "cust-c" });
    await confirmDeliveryWithCode(delivered.orderId, BRANCH, PARTNER_UID, delivered.code);
    const cancelled = await paidOrder({ customerId: "cust-c" });
    await cancelOrder(cancelled.orderId, "admin-1", "Out of stock");

    const codes = await deliveryCodesForCustomer("cust-c");
    expect([...codes.keys()]).toEqual([]);
    expect(codes.has(unpaid.reference)).toBe(false);
  });

  it("gives an order paid for before codes existed a code the first time its owner looks", async () => {
    const order = await paidOrder({ customerId: "cust-d" });
    await getPrisma().deliveryCode.delete({ where: { orderId: order.orderId } });

    const codes = await deliveryCodesForCustomer("cust-d");
    expect(codes.get(order.reference)).toMatch(/^\d{6}$/);
  });

  // The whole design rests on this: the person who is paid for saying "it
  // arrived" must not be able to read the proof off their own screen.
  it("never puts the code in what a branch or courier's order list loads", async () => {
    const order = await paidOrder({ route: "agent" });

    for (const scope of [{ branchId: "toyota-dar" }, { agentId: "bolt-send" }]) {
      const listed = await listOrders(scope, 200);
      expect(listed.some((o) => o.id === order.orderId)).toBe(true);
      expect(JSON.stringify(listed)).not.toContain(order.code);
      expect(JSON.stringify(listed)).not.toContain("deliveryCode");
    }
  });
});

describe("confirming a delivery with the code", () => {
  it("delivers the order, splits the money and records who entered it", async () => {
    const order = await paidOrder();

    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code)).resolves.toEqual({ ok: true });

    expect(await status(order.orderId)).toBe("fulfilled");
    expect(await ledgerKinds(order.orderId)).toEqual(["branch_payout", "collected", "malfleks_fee"]);
    const events = await orderHistory(order.orderId);
    expect(events.at(-1)).toMatchObject({ toStatus: "fulfilled", actorUid: PARTNER_UID, note: DELIVERY_CODE_NOTE });
    const row = await getPrisma().deliveryCode.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(row.usedBy).toBe(PARTNER_UID);
    expect(row.usedAt).not.toBeNull();
  });

  it("accepts the code typed the way it was read aloud", async () => {
    const order = await paidOrder();
    const spoken = `${order.code.slice(0, 3)} ${order.code.slice(3)}`;
    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, spoken)).resolves.toEqual({ ok: true });
  });

  it("lets the courier on an agent route enter it, and pays branch and courier", async () => {
    const order = await paidOrder({ route: "agent" });
    await expect(confirmDeliveryWithCode(order.orderId, COURIER, "uid-courier", order.code)).resolves.toEqual({ ok: true });
    expect(await ledgerKinds(order.orderId)).toEqual(["branch_payout", "collected", "courier_payout", "malfleks_fee"]);
  });

  it("refuses a wrong code, moves nothing, pays nobody, and says how many tries are left", async () => {
    const order = await paidOrder();

    const outcome = await confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, wrongCodeFor(order.code));
    expect(outcome).toEqual({ ok: false, reason: "wrong-code", triesLeft: WRONG_BEFORE_PAUSE - 1, lockedUntil: null, adminOnly: false });

    expect(await status(order.orderId)).toBe("confirmed");
    expect(await ledgerKinds(order.orderId)).toEqual(["collected"]);
  });

  it("does not count a mistyped entry that is not a code at all", async () => {
    const order = await paidOrder();
    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, "12345")).resolves.toEqual({ ok: false, reason: "bad-code" });
    const row = await getPrisma().deliveryCode.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(row.wrongAttempts).toBe(0);
  });

  it("refuses another branch, even with the right code — and does not count it as a guess", async () => {
    const order = await paidOrder();

    await expect(confirmDeliveryWithCode(order.orderId, { branchId: "toyota-arusha", agentId: null }, "uid-other", order.code)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(confirmDeliveryWithCode(order.orderId, { branchId: null, agentId: null }, "uid-none", order.code)).resolves.toEqual({ ok: false, reason: "not-found" });

    expect(await status(order.orderId)).toBe("confirmed");
  });

  it("refuses an order that has not been paid for", async () => {
    const order = await quotedOrder();
    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, "123456")).resolves.toEqual({ ok: false, reason: "not-paid" });
    expect(await status(order.orderId)).toBe("confirmed");
  });

  it("cannot be used twice", async () => {
    const order = await paidOrder();
    await confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code);
    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code)).resolves.toEqual({ ok: false, reason: "invalid-transition" });
  });

  it("cannot deliver an order that was cancelled", async () => {
    const order = await paidOrder();
    await cancelOrder(order.orderId, "admin-1", "Customer withdrew");
    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code)).resolves.toEqual({ ok: false, reason: "invalid-transition" });
    expect(await ledgerKinds(order.orderId)).toEqual(["collected"]);
  });

  it("delivers once when two phones enter the right code at the same moment", async () => {
    const order = await paidOrder();

    const outcomes = await Promise.all([
      confirmDeliveryWithCode(order.orderId, BRANCH, "uid-phone-1", order.code),
      confirmDeliveryWithCode(order.orderId, BRANCH, "uid-phone-2", order.code),
    ]);

    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.find((o) => !o.ok)).toEqual({ ok: false, reason: "invalid-transition" });
    const events = (await orderHistory(order.orderId)).filter((e) => e.toStatus === "fulfilled");
    expect(events).toHaveLength(1);
    expect((await ledgerKinds(order.orderId)).filter((k) => k === "branch_payout")).toHaveLength(1);
  });
});

describe("guessing the code", () => {
  it("pauses entry after five wrong codes, and refuses even the right code during the pause", async () => {
    const order = await paidOrder();
    const now = new Date("2026-10-05T10:00:00Z");
    const wrong = wrongCodeFor(order.code);

    for (let i = 1; i < WRONG_BEFORE_PAUSE; i += 1) {
      await confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, wrong, now);
    }
    const fifth = await confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, wrong, now);
    const until = new Date(now.getTime() + PAUSE_MINUTES * 60_000).toISOString();
    expect(fifth).toEqual({ ok: false, reason: "wrong-code", triesLeft: 0, lockedUntil: until, adminOnly: false });

    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code, now)).resolves.toEqual({ ok: false, reason: "locked", lockedUntil: until });
    expect(await status(order.orderId)).toBe("confirmed");
  });

  it("accepts the right code again once the pause is over", async () => {
    const order = await paidOrder();
    const now = new Date("2026-10-05T10:00:00Z");
    for (let i = 0; i < WRONG_BEFORE_PAUSE; i += 1) {
      await confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, wrongCodeFor(order.code), now);
    }
    const later = new Date(now.getTime() + (PAUSE_MINUTES + 1) * 60_000);
    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code, later)).resolves.toEqual({ ok: true });
  });

  it("locks the order for good after fifteen wrong codes, and puts it in front of an admin", async () => {
    const order = await paidOrder();
    let now = new Date("2026-10-05T10:00:00Z");
    const wrong = wrongCodeFor(order.code);
    let last: Awaited<ReturnType<typeof confirmDeliveryWithCode>> | null = null;
    for (let i = 1; i <= WRONG_BEFORE_LOCK; i += 1) {
      last = await confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, wrong, now);
      // Step past each pause, as a patient guesser would.
      if (i % WRONG_BEFORE_PAUSE === 0) now = new Date(now.getTime() + (PAUSE_MINUTES + 1) * 60_000);
    }
    expect(last).toMatchObject({ ok: false, reason: "wrong-code", adminOnly: true });

    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code, now)).resolves.toEqual({ ok: false, reason: "locked-admin" });
    expect(await status(order.orderId)).toBe("confirmed");

    const work = await deliveryProblemWork();
    expect(work.orders).toContainEqual(expect.objectContaining({ orderId: order.orderId, why: "locked" }));

    // The admin's way through still works, and pays as usual.
    await expect(markOrderFulfilled(order.orderId, "admin-1")).resolves.toEqual({ ok: true });
    expect((await deliveryProblemWork()).orders.some((o) => o.orderId === order.orderId)).toBe(false);
  });

  it("counts every one of a burst of wrong guesses sent at the same moment", async () => {
    const order = await paidOrder();
    const wrong = wrongCodeFor(order.code);
    const now = new Date("2026-10-05T10:00:00Z");

    const outcomes = await Promise.all(Array.from({ length: 12 }, () => confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, wrong, now)));

    // Five are checked; the rest hit the pause the fifth one set. None slipped
    // through uncounted, which is what the row lock is for.
    expect(outcomes.filter((o) => !o.ok && o.reason === "wrong-code")).toHaveLength(WRONG_BEFORE_PAUSE);
    expect(outcomes.filter((o) => !o.ok && o.reason === "locked")).toHaveLength(12 - WRONG_BEFORE_PAUSE);
    const row = await getPrisma().deliveryCode.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(row.wrongAttempts).toBe(WRONG_BEFORE_PAUSE);
  });
});

describe("\"I can't enter the code\"", () => {
  const NOTE = "Delivered, but the customer's phone is off and they forgot the code.";

  it("records the partner's words, moves nothing and pays nobody", async () => {
    const order = await paidOrder();

    await expect(reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, `  ${NOTE}  `)).resolves.toEqual({ ok: true });

    expect(await status(order.orderId)).toBe("confirmed");
    expect(await ledgerKinds(order.orderId)).toEqual(["collected"]);
    const row = await getPrisma().deliveryCode.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(row).toMatchObject({ problemBy: PARTNER_UID, problemNote: NOTE });
    expect((await deliveryProblemWork()).orders).toContainEqual(expect.objectContaining({ orderId: order.orderId, why: "reported" }));
  });

  it("needs a real sentence", async () => {
    const order = await paidOrder();
    await expect(reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, "no code")).resolves.toEqual({ ok: false, reason: "note-required" });
    await expect(reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, undefined)).resolves.toEqual({ ok: false, reason: "note-required" });
  });

  it("keeps the first report: a second cannot rewrite it", async () => {
    const order = await paidOrder();
    await reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, NOTE);
    await expect(reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, "Actually something else happened here.")).resolves.toEqual({ ok: false, reason: "already-reported" });
    const row = await getPrisma().deliveryCode.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(row.problemNote).toBe(NOTE);
  });

  it("is refused for someone else's order and for an unpaid one", async () => {
    const paid = await paidOrder();
    await expect(reportDeliveryProblem(paid.orderId, { branchId: "toyota-arusha", agentId: null }, "uid-other", NOTE)).resolves.toEqual({ ok: false, reason: "not-found" });
    const unpaid = await quotedOrder();
    await expect(reportDeliveryProblem(unpaid.orderId, BRANCH, PARTNER_UID, NOTE)).resolves.toEqual({ ok: false, reason: "not-paid" });
  });

  it("still lets the code be entered if the customer turns up with it", async () => {
    const order = await paidOrder();
    await reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, NOTE);

    await expect(confirmDeliveryWithCode(order.orderId, BRANCH, PARTNER_UID, order.code)).resolves.toEqual({ ok: true });
    expect((await deliveryProblemWork()).orders.some((o) => o.orderId === order.orderId)).toBe(false);
  });

  it("leaves the admin's queue once the admin cancels the order instead", async () => {
    const order = await paidOrder();
    await reportDeliveryProblem(order.orderId, BRANCH, PARTNER_UID, NOTE);
    await cancelOrder(order.orderId, "admin-1", "Customer says nothing arrived");
    expect((await deliveryProblemWork()).orders.some((o) => o.orderId === order.orderId)).toBe(false);
  });
});
