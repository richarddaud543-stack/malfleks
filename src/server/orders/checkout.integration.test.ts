// @vitest-environment node
//
// Real Postgres; ClickPesa and the email provider are mocked. What is being
// proved is the part that is ours: that confirming an order opens a checkout
// exactly once, that only the customer who placed an order can see or pay for
// it, and that "I've paid" cannot be used to burn the ClickPesa API allowance.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateCheckoutLink = vi.fn();
const queryPaymentStatus = vi.fn();
vi.mock("@/server/payments/clickpesa", () => ({
  generateCheckoutLink: (...args: unknown[]) => generateCheckoutLink(...args),
  queryPaymentStatus: (...args: unknown[]) => queryPaymentStatus(...args),
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
import { capturePayment, PAYMENT_ACTOR } from "@/server/payments/settle";
import { checkoutForCustomer, checkoutStatesForCustomer, checkPaymentForCustomer, openCheckout } from "./checkout";
import { createOrder } from "./create-order";
import { cancelOrder, confirmOrder } from "./status";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("checkout");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let n = 0;
beforeEach(() => {
  generateCheckoutLink.mockReset();
  queryPaymentStatus.mockReset();
  sendCustomerEmail.mockReset();
  sendNotification.mockReset();
  generateCheckoutLink.mockImplementation(async () => ({ ok: true, checkoutLink: `https://checkout.clickpesa.com/TEST${++n}` }));
  queryPaymentStatus.mockResolvedValue({ ok: true, found: false });
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
});

const ASHA = "uid-asha";

/** A real order placed by a signed-in customer. Brand-fleet route, so it has a full quote. */
async function order(customerId: string | null = ASHA, email: string | null = "asha@example.test") {
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
    email,
  );
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

describe("the email address on an order", () => {
  it("is kept for a signed-in customer and never for a signed-out one", async () => {
    const mine = await order();
    const anonymous = await order(null, "typed@example.test");
    const rows = await getPrisma().order.findMany({ where: { id: { in: [mine.id, anonymous.id] } }, select: { id: true, customerEmail: true } });
    expect(rows.find((r) => r.id === mine.id)?.customerEmail).toBe("asha@example.test");
    expect(rows.find((r) => r.id === anonymous.id)?.customerEmail).toBeNull();
  });
});

describe("openCheckout", () => {
  it("makes one link for a confirmed order and emails the customer where to pay", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");

    await expect(openCheckout(o.id)).resolves.toEqual({ ok: true, reused: false, emailed: true });
    expect(generateCheckoutLink).toHaveBeenCalledTimes(1);
    expect(generateCheckoutLink.mock.calls[0][0]).toMatchObject({ totalPriceTZS: 68_000_000 });

    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe("asha@example.test");
    expect(subject).toContain(o.reference);
    expect(body).toContain(`/pay/${o.reference}`);
    // The email carries the MalFleks page, never the raw ClickPesa link.
    expect(body).not.toContain("clickpesa.com");

    // Asking again reuses the link and does not email twice.
    await expect(openCheckout(o.id)).resolves.toEqual({ ok: true, reused: true, emailed: false });
    expect(generateCheckoutLink).toHaveBeenCalledTimes(1);
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });

  // Changed 3 Oct 2026: the customer pays as they order, so a pending order
  // gets a link too. The order form asks for it with `notify: false`, because
  // the customer is taken straight to the page that shows it.
  it("opens a checkout for an order nobody has confirmed, without emailing when the form asked for it", async () => {
    const o = await order();
    await expect(openCheckout(o.id, { notify: false })).resolves.toEqual({ ok: true, reused: false, emailed: false });
    expect(generateCheckoutLink).toHaveBeenCalledTimes(1);
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("refuses a cancelled order", async () => {
    const o = await order();
    await cancelOrder(o.id, "admin-1", "Out of stock");
    await expect(openCheckout(o.id)).resolves.toEqual({ ok: false, reason: "wrong-status" });
    expect(generateCheckoutLink).not.toHaveBeenCalled();
  });
});

describe("paying confirms the order", () => {
  it("moves a pending order to confirmed in the same step that records the payment, and says who did it", async () => {
    const o = await order();
    await openCheckout(o.id, { notify: false });
    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });

    await capturePayment({ providerRef: payment.providerRef, paymentReference: "CPAUTO1", collectedAmount: 68_000_000, source: "webhook" });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true, decidedBy: true, events: true } });
    expect(row.status).toBe("confirmed");
    expect(row.decidedBy).toBe(PAYMENT_ACTOR);
    expect(row.events).toHaveLength(1);
    expect(row.events[0]).toMatchObject({ fromStatus: "pending", toStatus: "confirmed", actorUid: PAYMENT_ACTOR });

    // A second notification of the same payment changes nothing.
    await capturePayment({ providerRef: "CPAUTO1", paymentReference: "CPAUTO1", collectedAmount: 68_000_000, source: "webhook" });
    expect(await getPrisma().orderEvent.count({ where: { orderId: o.id } })).toBe(1);
  });

  it("leaves an order someone already confirmed exactly as it was", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    await openCheckout(o.id);
    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment({ providerRef: payment.providerRef, paymentReference: "CPAUTO2", collectedAmount: 68_000_000, source: "webhook" });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true, decidedBy: true } });
    expect(row).toEqual({ status: "confirmed", decidedBy: "admin-1" });
    expect(await getPrisma().orderEvent.count({ where: { orderId: o.id } })).toBe(1);
  });

  it("does not revive an order cancelled before the money arrived -- it stays cancelled, with a refund owed", async () => {
    const o = await order();
    await openCheckout(o.id, { notify: false });
    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    await cancelOrder(o.id, "admin-1", "Out of stock");

    await capturePayment({ providerRef: payment.providerRef, paymentReference: "CPAUTO3", collectedAmount: 68_000_000, source: "webhook" });
    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true } });
    expect(row.status).toBe("cancelled");
  });
});

describe("checkoutForCustomer", () => {
  it("shows nothing to anyone but the customer who placed the order", async () => {
    const o = await order();
    await expect(checkoutForCustomer("uid-someone-else", o.reference)).resolves.toBeNull();
    await expect(checkoutForCustomer(ASHA, "NO-SUCH-REF")).resolves.toBeNull();
  });

  it("is ready to pay the moment the order is placed, and paid once the money arrives", async () => {
    const o = await order();
    // A plain read (the account page, the poll) never creates a link...
    expect(await checkoutForCustomer(ASHA, o.reference)).toMatchObject({ state: "waiting", checkoutLink: null });
    expect(generateCheckoutLink).not.toHaveBeenCalled();

    // ...the pay page does, without anyone confirming anything first.
    const ready = await checkoutForCustomer(ASHA, o.reference, { createIfMissing: true });
    expect(ready).toMatchObject({ state: "ready", orderStatus: "pending", totalTZS: 68_000_000 });
    expect(ready?.checkoutLink).toMatch(/^https:\/\/checkout\.clickpesa\.com\//);
    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect((await checkoutStatesForCustomer(ASHA)).get(o.reference)).toMatchObject({ state: "ready" });

    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment({ providerRef: payment.providerRef, paymentReference: "CPPAID1", collectedAmount: 68_000_000, source: "webhook" });

    const paid = await checkoutForCustomer(ASHA, o.reference);
    expect(paid).toMatchObject({ state: "paid", orderStatus: "confirmed", checkoutLink: null, paymentReference: "CPPAID1" });
    expect((await checkoutStatesForCustomer(ASHA)).get(o.reference)).toMatchObject({ state: "paid" });
  });

  it("waits for the branch only when the order cannot be priced yet", async () => {
    generateCheckoutLink.mockResolvedValue({ ok: false, reason: "request-failed" });
    const o = await order();
    expect(await checkoutForCustomer(ASHA, o.reference, { createIfMissing: true })).toMatchObject({ state: "waiting" });
  });

  it("stops asking ClickPesa for a link after three failures in a row", async () => {
    generateCheckoutLink.mockResolvedValue({ ok: false, reason: "request-failed" });
    const o = await order();
    await confirmOrder(o.id, "admin-1");

    for (let i = 0; i < 6; i++) {
      expect(await checkoutForCustomer(ASHA, o.reference, { createIfMissing: true })).toMatchObject({ state: "unavailable" });
    }
    expect(generateCheckoutLink).toHaveBeenCalledTimes(3);
  });

  it("shows a cancelled order as cancelled, with the reason", async () => {
    const o = await order();
    await cancelOrder(o.id, "admin-1", "Out of stock");
    expect(await checkoutForCustomer(ASHA, o.reference, { createIfMissing: true })).toMatchObject({
      state: "cancelled",
      cancelReason: "Out of stock",
    });
    // The account page used to show nothing at all for a cancelled order.
    expect((await checkoutStatesForCustomer(ASHA)).get(o.reference)).toEqual({
      state: "cancelled",
      cancelReason: "Out of stock",
      refundDue: false,
      keepSavedCopy: false,
    });
  });
});

describe("\"I've paid — check now\"", () => {
  it("asks ClickPesa at most once a minute per payment, however often it is pressed", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    await openCheckout(o.id);

    for (let i = 0; i < 5; i++) await checkPaymentForCustomer(ASHA, o.reference);
    expect(queryPaymentStatus).toHaveBeenCalledTimes(1);

    await expect(checkPaymentForCustomer("uid-someone-else", o.reference)).resolves.toBeNull();
    expect(queryPaymentStatus).toHaveBeenCalledTimes(1);
  });

  it("records the payment when ClickPesa says it succeeded", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    await openCheckout(o.id);
    queryPaymentStatus.mockResolvedValue({
      ok: true,
      found: true,
      records: [{ status: "SUCCESS", paymentReference: "CPPAID2", orderReference: null, collectedAmount: 68_000_000, message: null, updatedAt: null }],
    });

    expect(await checkPaymentForCustomer(ASHA, o.reference)).toMatchObject({ state: "paid", paymentReference: "CPPAID2" });
  });
});

describe("receipts", () => {
  it("emails the customer and MalFleks once when a payment is captured, and not again on a repeat", async () => {
    const o = await order();
    await confirmOrder(o.id, "admin-1");
    await openCheckout(o.id);
    sendCustomerEmail.mockClear();

    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    const input = { providerRef: payment.providerRef, paymentReference: "CPPAID3", collectedAmount: 68_000_000, source: "webhook" as const };
    await capturePayment(input);
    await capturePayment({ ...input, providerRef: "CPPAID3" });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe("asha@example.test");
    expect(subject).toContain("Payment received");
    expect(body).toContain("CPPAID3");
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
