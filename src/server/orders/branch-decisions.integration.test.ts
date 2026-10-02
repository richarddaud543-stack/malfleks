// @vitest-environment node
//
// Real Postgres; ClickPesa and the email provider are mocked. What is being
// proved is who may answer an order: the active partner who owns the branch
// it was sent to, and nobody else -- not another branch, not the courier
// carrying it, not a suspended partner, not a customer -- and that answering
// does exactly what an admin answering does, once.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateCheckoutLink = vi.fn();
vi.mock("@/server/payments/clickpesa", () => ({
  generateCheckoutLink: (...args: unknown[]) => generateCheckoutLink(...args),
  queryPaymentStatus: vi.fn(),
}));

const sendCustomerEmail = vi.fn();
const sendNotification = vi.fn();
const sendPartnerEmail = vi.fn();
vi.mock("@/server/notify/email", async (original) => ({
  ...(await original<typeof import("@/server/notify/email")>()),
  sendCustomerEmail: (...args: unknown[]) => sendCustomerEmail(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
  sendPartnerEmail: (...args: unknown[]) => sendPartnerEmail(...args),
}));

import { getOrderDetail } from "@/server/admin/orders";
import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createTestPartner } from "@/server/partners/test-fixtures";
import { confirmOrderAsBranch, declineOrderAsBranch } from "./branch-decisions";
import { createOrder } from "./create-order";
import { cancelOrder, confirmOrder, orderHistory } from "./status";

let db: TestDatabase;

const OWNER = "uid-toyota-dar-owner";
const OTHER_BRANCH = "uid-toyota-arusha-owner";
const COURIER = "uid-arusha-courier";
const SUSPENDED = "uid-ford-dar-suspended";
const CUSTOMER = "uid-asha";

beforeAll(async () => {
  db = await createTestDatabase("branch-decisions");
  await seedDatabase(getPrisma());
  await createTestPartner({ uid: OWNER, email: "dar@toyota.example.test", branchId: "toyota-dar" });
  await createTestPartner({ uid: OTHER_BRANCH, email: "arusha@toyota.example.test", branchId: "toyota-arusha" });
  await createTestPartner({ uid: COURIER, email: "swift@example.test", kind: "courier", agentId: "arusha-swift-couriers" });
  await createTestPartner({ uid: SUSPENDED, email: "dar@ford.example.test", branchId: "ford-dar", status: "suspended" });
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let n = 0;
beforeEach(() => {
  generateCheckoutLink.mockReset();
  sendCustomerEmail.mockReset();
  sendNotification.mockReset();
  sendPartnerEmail.mockReset();
  generateCheckoutLink.mockImplementation(async () => ({ ok: true, checkoutLink: `https://checkout.clickpesa.com/BRANCH${++n}` }));
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
  sendPartnerEmail.mockResolvedValue({ sent: true });
});

/** A signed-in customer's order. `toyota-corolla` is sold by `toyota-dar` (own fleet, fully quoted). */
async function order(productId = "toyota-corolla", agentId: string | null = null) {
  const created = await createOrder(
    {
      productId,
      quantity: "1",
      fullName: "Asha Mwenda",
      phone: "0754123456",
      address: "Mikocheni B, near the Shell station",
      agentId,
      reference: "",
      requestedAt: new Date().toISOString(),
    },
    CUSTOMER,
    "asha@example.test",
  );
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

const row = (id: string) =>
  getPrisma().order.findUniqueOrThrow({ where: { id }, select: { status: true, decidedBy: true, decisionNote: true, branchId: true, agentId: true } });

describe("the branch confirming its own order", () => {
  it("confirms it, opens the checkout once and emails the customer the pay link", async () => {
    const o = await order();

    await expect(confirmOrderAsBranch(OWNER, o.id)).resolves.toEqual({ ok: true, emailed: true });

    expect(await row(o.id)).toMatchObject({ status: "confirmed", decidedBy: OWNER });
    expect(generateCheckoutLink).toHaveBeenCalledTimes(1);
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe("asha@example.test");
    expect(subject).toContain(o.reference);
    expect(body).toContain(`/pay/${o.reference}`);

    // Recorded the way an admin's decision is, in the same two places.
    const history = await orderHistory(o.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: "pending", toStatus: "confirmed", actorUid: OWNER });
  });

  it("is a no-op the second time: no second checkout, no second email", async () => {
    const o = await order();
    await confirmOrderAsBranch(OWNER, o.id);
    generateCheckoutLink.mockClear();
    sendCustomerEmail.mockClear();

    await expect(confirmOrderAsBranch(OWNER, o.id)).resolves.toEqual({ ok: false, reason: "invalid-transition" });

    expect(generateCheckoutLink).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect(await orderHistory(o.id)).toHaveLength(1);
    expect(await getPrisma().orderPayment.count({ where: { orderId: o.id } })).toBe(1);
  });

  it("stays confirmed when ClickPesa is down -- the pay page makes the link later", async () => {
    generateCheckoutLink.mockResolvedValue({ ok: false, reason: "request-failed" });
    const o = await order();

    await expect(confirmOrderAsBranch(OWNER, o.id)).resolves.toEqual({ ok: true, emailed: false });
    expect(await row(o.id)).toMatchObject({ status: "confirmed" });
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("shows on the admin timeline as confirmed by the branch, not by an admin", async () => {
    const mine = await order();
    await confirmOrderAsBranch(OWNER, mine.id);
    const byBranch = (await getOrderDetail(mine.id))!.timeline.find((t) => t.type === "status");
    expect(byBranch).toMatchObject({ to: "confirmed", actor: OWNER, by: "branch" });

    // And an admin's own confirmation still reads as an admin's.
    const theirs = await order();
    await confirmOrder(theirs.id, "admin-1");
    const byAdmin = (await getOrderDetail(theirs.id))!.timeline.find((t) => t.type === "status");
    expect(byAdmin).toMatchObject({ to: "confirmed", by: "admin" });
  });
});

describe("who may not answer an order", () => {
  it("another branch's partner cannot, and learns nothing about the order", async () => {
    const o = await order();

    await expect(confirmOrderAsBranch(OTHER_BRANCH, o.id)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(declineOrderAsBranch(OTHER_BRANCH, o.id, "Out of stock")).resolves.toEqual({ ok: false, reason: "not-found" });
    // The same answer as an id that does not exist at all.
    await expect(confirmOrderAsBranch(OTHER_BRANCH, "no-such-order")).resolves.toEqual({ ok: false, reason: "not-found" });

    expect(await row(o.id)).toMatchObject({ status: "pending", decidedBy: null });
    expect(generateCheckoutLink).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("the courier carrying it cannot -- whether the branch has it is not theirs to say", async () => {
    // `toyota-hilux` is sold by toyota-arusha, which does not deliver: an agent route.
    const o = await order("toyota-hilux", "arusha-swift-couriers");
    expect(await row(o.id)).toMatchObject({ branchId: "toyota-arusha", agentId: "arusha-swift-couriers" });

    await expect(confirmOrderAsBranch(COURIER, o.id)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(declineOrderAsBranch(COURIER, o.id, "Too far")).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(await row(o.id)).toMatchObject({ status: "pending", decidedBy: null });

    // The branch it was sent to still can.
    await expect(confirmOrderAsBranch(OTHER_BRANCH, o.id)).resolves.toMatchObject({ ok: true });
    expect(await row(o.id)).toMatchObject({ status: "confirmed", decidedBy: OTHER_BRANCH });
  });

  it("a suspended partner cannot, even on its own branch's order", async () => {
    const o = await order("ford-ranger");
    expect(await row(o.id)).toMatchObject({ branchId: "ford-dar" });

    await expect(confirmOrderAsBranch(SUSPENDED, o.id)).resolves.toEqual({ ok: false, reason: "partner-suspended" });
    await expect(declineOrderAsBranch(SUSPENDED, o.id, "Out of stock")).resolves.toEqual({ ok: false, reason: "partner-suspended" });
    expect(await row(o.id)).toMatchObject({ status: "pending", decidedBy: null });
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("an ordinary customer cannot, including the one who placed it", async () => {
    const o = await order();
    await expect(confirmOrderAsBranch(CUSTOMER, o.id)).resolves.toEqual({ ok: false, reason: "not-a-partner" });
    await expect(confirmOrderAsBranch("", o.id)).resolves.toEqual({ ok: false, reason: "not-a-partner" });
    expect(await row(o.id)).toMatchObject({ status: "pending" });
  });
});

describe("the branch declining an order", () => {
  it("needs a reason of at least three characters", async () => {
    const o = await order();
    for (const blank of ["", "   ", "no", " x "]) {
      await expect(declineOrderAsBranch(OWNER, o.id, blank)).resolves.toEqual({ ok: false, reason: "reason-required" });
    }
    expect(await row(o.id)).toMatchObject({ status: "pending" });
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("cancels with the reason, records who decided, and tells the customer they were not charged", async () => {
    const o = await order();

    await expect(declineOrderAsBranch(OWNER, o.id, "  Out of stock until next week ")).resolves.toEqual({ ok: true });

    expect(await row(o.id)).toMatchObject({ status: "cancelled", decidedBy: OWNER, decisionNote: "Out of stock until next week" });
    const history = await orderHistory(o.id);
    expect(history[0]).toMatchObject({ fromStatus: "pending", toStatus: "cancelled", actorUid: OWNER, note: "Out of stock until next week" });
    expect((await getOrderDetail(o.id))!.timeline.find((t) => t.type === "status")).toMatchObject({ to: "cancelled", by: "branch" });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe("asha@example.test");
    expect(subject).toContain(o.reference);
    expect(body).toContain("The reason: Out of stock until next week");
    expect(body).toContain("You have not been charged.");
    // No checkout is ever opened for a declined order.
    expect(generateCheckoutLink).not.toHaveBeenCalled();

    // Declining again changes nothing and sends nothing.
    sendCustomerEmail.mockClear();
    await expect(declineOrderAsBranch(OWNER, o.id, "Out of stock")).resolves.toEqual({ ok: false, reason: "invalid-transition" });
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("cannot back out of an order it has already confirmed -- that is a refund decision, and admin's", async () => {
    const o = await order();
    await confirmOrderAsBranch(OWNER, o.id);
    sendCustomerEmail.mockClear();

    await expect(declineOrderAsBranch(OWNER, o.id, "Changed our mind")).resolves.toEqual({ ok: false, reason: "invalid-transition" });
    expect(await row(o.id)).toMatchObject({ status: "confirmed" });
    expect(sendCustomerEmail).not.toHaveBeenCalled();

    // The admin keeps that power.
    await expect(cancelOrder(o.id, "admin-1", "Customer withdrew")).resolves.toEqual({ ok: true });
  });
});
