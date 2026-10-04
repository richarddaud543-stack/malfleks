// @vitest-environment node
//
// Real Postgres; ClickPesa and the email provider are mocked. What is proved
// here is the rule itself: a customer can cancel their own unpaid order and
// nobody else's, a paid order is never cancelled from the customer's side --
// it is asked about -- and an order that is over cannot be touched at all.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateCheckoutLink = vi.fn();
vi.mock("@/server/payments/clickpesa", () => ({
  generateCheckoutLink: (...args: unknown[]) => generateCheckoutLink(...args),
  queryPaymentStatus: vi.fn().mockResolvedValue({ ok: true, found: false }),
}));

const sendCustomerEmail = vi.fn();
const sendNotification = vi.fn();
vi.mock("@/server/notify/email", async (original) => ({
  ...(await original<typeof import("@/server/notify/email")>()),
  sendCustomerEmail: (...args: unknown[]) => sendCustomerEmail(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { capturePayment } from "@/server/payments/settle";
import { checkoutStatesForCustomer, openCheckout } from "./checkout";
import { createOrder } from "./create-order";
import { cancelOrderAsCustomer } from "./customer-cancel";
import { CUSTOMER_CANCEL_NOTE, cancelOrder, confirmOrder, markOrderFulfilled, orderHistory } from "./status";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("customer_cancel");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let n = 0;
beforeEach(() => {
  generateCheckoutLink.mockReset();
  sendCustomerEmail.mockReset();
  sendNotification.mockReset();
  generateCheckoutLink.mockImplementation(async () => ({ ok: true, checkoutLink: `https://checkout.clickpesa.com/CANCEL${++n}` }));
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
});

const ASHA = "uid-asha-cancel";
const OTHER = "uid-someone-else";

async function order(customerId: string = ASHA) {
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
    "asha@example.test",
  );
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

/** The order, paid for the way production pays for one: checkout opened, payment captured. */
async function paidOrder() {
  const o = await order();
  await openCheckout(o.id, { notify: false });
  const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
  await capturePayment({ providerRef: payment.providerRef, paymentReference: `CP${payment.providerRef}`, collectedAmount: payment.amountTZS, source: "webhook" });
  sendCustomerEmail.mockClear();
  sendNotification.mockClear();
  return o;
}

const statusOf = async (id: string) => (await getPrisma().order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

describe("cancelling an order you have not paid for", () => {
  it("cancels it there and then, records that the customer did it, and tells them nothing was charged", async () => {
    const o = await order();
    await openCheckout(o.id, { notify: false });

    await expect(cancelOrderAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true, kind: "cancelled" });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true, decidedBy: true, decisionNote: true } });
    expect(row).toEqual({ status: "cancelled", decidedBy: ASHA, decisionNote: CUSTOMER_CANCEL_NOTE });

    const history = await orderHistory(o.id);
    expect(history[history.length - 1]).toMatchObject({ fromStatus: "pending", toStatus: "cancelled", actorUid: ASHA });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    expect(sendCustomerEmail.mock.calls[0][2]).toMatch(/You have not been charged/);
    // Nobody at MalFleks has anything to do about an unpaid order that went away.
    expect(sendNotification).not.toHaveBeenCalled();

    expect((await checkoutStatesForCustomer(ASHA)).get(o.reference)).toMatchObject({ state: "cancelled", refundDue: false });
  });

  it("works on an order that was confirmed but never paid", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    await expect(cancelOrderAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true, kind: "cancelled" });
    expect(await statusOf(o.id)).toBe("cancelled");
  });

  it("cannot be used on someone else's order, and reveals nothing about it", async () => {
    const o = await order();

    await expect(cancelOrderAsCustomer(OTHER, o.reference)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(cancelOrderAsCustomer(ASHA, "NO-SUCH-REF")).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(await statusOf(o.id)).toBe("pending");
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("does nothing to an order that is already cancelled or delivered", async () => {
    const gone = await order();
    await cancelOrder(gone.id, "admin-1", "Out of stock");
    const done = await order();
    await confirmOrder(done.id, "admin-1");
    await markOrderFulfilled(done.id, "admin-1");
    sendCustomerEmail.mockClear();

    await expect(cancelOrderAsCustomer(ASHA, gone.reference)).resolves.toEqual({ ok: false, reason: "too-late" });
    await expect(cancelOrderAsCustomer(ASHA, done.reference)).resolves.toEqual({ ok: false, reason: "too-late" });
    expect(await statusOf(done.id)).toBe("fulfilled");
    // The first cancellation's reason stands; the customer's attempt did not overwrite it.
    expect((await getPrisma().order.findUniqueOrThrow({ where: { id: gone.id }, select: { decisionNote: true } })).decisionNote).toBe("Out of stock");
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("has exactly one winner when the customer cancels twice at once", async () => {
    const o = await order();
    const results = await Promise.all([cancelOrderAsCustomer(ASHA, o.reference), cancelOrderAsCustomer(ASHA, o.reference)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await orderHistory(o.id)).filter((e) => e.toStatus === "cancelled")).toHaveLength(1);
  });
});

describe("an order you have already paid for", () => {
  it("is not cancelled: MalFleks is asked, with the reference and how to reach the customer", async () => {
    const o = await paidOrder();

    await expect(cancelOrderAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true, kind: "requested" });

    // Nothing moved. The money is held and the order is still the branch's to deliver.
    expect(await statusOf(o.id)).toBe("confirmed");
    expect((await checkoutStatesForCustomer(ASHA)).get(o.reference)).toMatchObject({ state: "paid" });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [subject, body] = sendNotification.mock.calls[0];
    expect(subject).toContain(o.reference);
    expect(subject).toMatch(/asks to cancel/);
    expect(body).toContain("Asha Mwenda");
    expect(body).toContain(`/admin/orders/${o.id}`);
    expect(body).toMatch(/Nothing has been cancelled/);
    // The customer is told on the page; no email claims a cancellation that has not happened.
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("can be asked about once a day, not once a press", async () => {
    const o = await paidOrder();

    await expect(cancelOrderAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true, kind: "requested" });
    await expect(cancelOrderAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: false, reason: "already-asked" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("is not cancelled by the customer even if the payment lands between the page loading and the press", async () => {
    // The page was drawn while this was unpaid, so the button said "Cancel
    // this order". By the time it is pressed the money is in.
    const o = await order();
    await openCheckout(o.id, { notify: false });
    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment({ providerRef: payment.providerRef, paymentReference: "CPRACE1", collectedAmount: payment.amountTZS, source: "webhook" });

    await expect(cancelOrderAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true, kind: "requested" });
    expect(await statusOf(o.id)).toBe("confirmed");
  });
});
