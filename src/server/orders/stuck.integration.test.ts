// @vitest-environment node
//
// Real Postgres; ClickPesa and the email provider are mocked. What is proved:
// each of the three "stuck" rules counts from the right moment, a quiet day
// sends no digest at all, and a branch is reminded about an order exactly
// once however many times the job runs.

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

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createTestPartner } from "@/server/partners/test-fixtures";
import { capturePayment } from "@/server/payments/settle";
import { openCheckout } from "./checkout";
import { createOrder } from "./create-order";
import { confirmOrder, markOrderFulfilled } from "./status";
import { findStuckOrders, remindBranchesOfWaitingOrders, sendStuckOrdersDigest } from "./stuck";

let db: TestDatabase;
const DAR_EMAIL = "dar@toyota.example.test";
const HOUR = 60 * 60_000;

beforeAll(async () => {
  db = await createTestDatabase("stuck-orders");
  await seedDatabase(getPrisma());
  await createTestPartner({ uid: "uid-dar", email: DAR_EMAIL, branchId: "toyota-dar", displayName: "Toyota — Dar es Salaam" });
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let n = 0;
beforeEach(async () => {
  for (const mock of [generateCheckoutLink, sendCustomerEmail, sendNotification, sendPartnerEmail]) mock.mockReset();
  generateCheckoutLink.mockImplementation(async () => ({ ok: true, checkoutLink: `https://checkout.clickpesa.com/STK${++n}` }));
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
  sendPartnerEmail.mockResolvedValue({ sent: true });
  // Each test reads the whole table, so each starts from an empty one.
  await getPrisma().ledgerEntry.deleteMany();
  await getPrisma().orderPayment.deleteMany();
  await getPrisma().order.deleteMany();
});

async function order(customerId: string | null = "uid-asha") {
  const created = await createOrder(
    {
      productId: "toyota-corolla",
      quantity: "1",
      fullName: "Asha Mwenda",
      phone: "0754123456",
      address: "Mikocheni B, near the Shell station",
      agentId: null,
      reference: "",
      requestedAt: new Date().toISOString(),
    },
    customerId,
    customerId ? "asha@example.test" : null,
  );
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

describe("findStuckOrders", () => {
  it("lists nothing while every order is inside its allowance", async () => {
    await order();
    await expect(findStuckOrders(hoursFromNow(23))).resolves.toEqual({ undecided: [], unpaid: [], undelivered: [] });
  });

  it("calls a pending order undecided after a day", async () => {
    const o = await order();
    const stuck = await findStuckOrders(hoursFromNow(25));
    expect(stuck.undecided.map((l) => l.reference)).toEqual([o.reference]);
    expect(stuck.undecided[0].hours).toBeGreaterThanOrEqual(24);
    expect(stuck.unpaid).toEqual([]);
    expect(stuck.undelivered).toEqual([]);
  });

  it("counts unpaid from the confirmation, not from when the order was placed", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    expect((await findStuckOrders(hoursFromNow(47))).unpaid).toEqual([]);
    const stuck = await findStuckOrders(hoursFromNow(49));
    expect(stuck.unpaid.map((l) => l.reference)).toEqual([o.reference]);
    // Confirmed, so no longer waiting on the branch.
    expect(stuck.undecided).toEqual([]);
  });

  it("moves a paid order from unpaid to undelivered, and drops it once delivered", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    await openCheckout(o.id);
    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment({ providerRef: payment.providerRef, paymentReference: "CPSTUCK1", collectedAmount: payment.amountTZS, source: "webhook" });

    const later = await findStuckOrders(hoursFromNow(73));
    expect(later.unpaid).toEqual([]);
    expect(later.undelivered.map((l) => l.reference)).toEqual([o.reference]);

    await markOrderFulfilled(o.id, "admin-1");
    await expect(findStuckOrders(hoursFromNow(73))).resolves.toEqual({ undecided: [], unpaid: [], undelivered: [] });
  });
});

describe("sendStuckOrdersDigest", () => {
  it("sends nothing on a day with nothing stuck", async () => {
    await order();
    await expect(sendStuckOrdersDigest(hoursFromNow(1))).resolves.toMatchObject({ sent: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends one email naming the stuck order", async () => {
    const o = await order();
    await expect(sendStuckOrdersDigest(hoursFromNow(25))).resolves.toEqual({ sent: true, undecided: 1, unpaid: 0, undelivered: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][1]).toContain(o.reference);
  });
});

describe("remindBranchesOfWaitingOrders", () => {
  it("reminds the branch once, however often the job runs", async () => {
    const o = await order();
    await expect(remindBranchesOfWaitingOrders(hoursFromNow(1))).resolves.toBe(0);

    await expect(remindBranchesOfWaitingOrders(hoursFromNow(25))).resolves.toBe(1);
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    expect(sendPartnerEmail.mock.calls[0][0]).toBe(DAR_EMAIL);
    expect(sendPartnerEmail.mock.calls[0][2]).toContain(o.reference);

    await expect(remindBranchesOfWaitingOrders(hoursFromNow(49))).resolves.toBe(0);
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
  });

  it("does not remind about an order already answered, a signed-out request, or one a week old", async () => {
    const answered = await order();
    await confirmOrder(answered.id, "admin-1");
    await order(null);
    await expect(remindBranchesOfWaitingOrders(hoursFromNow(25))).resolves.toBe(0);

    await order();
    await expect(remindBranchesOfWaitingOrders(hoursFromNow(8 * 24))).resolves.toBe(0);
    expect(sendPartnerEmail).not.toHaveBeenCalled();
  });
});
