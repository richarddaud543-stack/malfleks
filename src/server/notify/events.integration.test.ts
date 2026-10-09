// @vitest-environment node
//
// Real Postgres; the email provider, ClickPesa and the session are mocked.
//
// What is being proved is the half of a notification a message-builder test
// cannot reach: that the right *person* is told, at the right *moment*, and
// only once. So these go through the real Server Actions -- the place the
// emails are actually sent from -- with a real database underneath, and count
// what reached each of the three senders.

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

// The actions' own gates. Who is signed in is a variable here, not the thing
// under test -- `admin-session.test.ts` and the DAL cover that.
const session = vi.fn();
vi.mock("@/server/auth/admin-session", () => ({ adminSession: () => session() }));
vi.mock("@/server/auth/dal", () => ({ verifySession: () => session() }));
vi.mock("@/server/auth/config", () => ({ isAuthConfigured: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/revalidate-public-site", () => ({ notifyPublicSiteOfCatalogueChange: vi.fn(async () => {}) }));

import { markPayoutPaidAction, recordRefundAction, setPartnerStatusAction } from "@/app/actions/admin-console";
import { cancelOrder as cancelOrderAction, markOrderFulfilled as markFulfilledAction, submitOrder } from "@/app/actions/orders";
import { approvePartnerApplication, rejectPartnerApplication } from "@/app/actions/partner-review";
import { rejectProductSubmission } from "@/app/actions/product-review";
import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createPayoutBatch } from "@/server/money/payouts";
import { openCheckout } from "@/server/orders/checkout";
import { createOrder } from "@/server/orders/create-order";
import { confirmOrder, markOrderFulfilled } from "@/server/orders/status";
import { createApplicationForUser } from "@/server/partners/applications";
import { createTestPartner } from "@/server/partners/test-fixtures";
import { capturePayment } from "@/server/payments/settle";
import { notifyOfNewOrder, notifyPartnerActivated, notifyProductDecision, partnerContact } from "./events";

let db: TestDatabase;

const ADMIN = { uid: "admin-1", email: "admin@malfleks.example.test", name: "Admin" };
const CUSTOMER = { uid: "uid-asha", email: "asha@example.test", name: "Asha Mwenda" };
const DAR_EMAIL = "dar@toyota.example.test";
const ARUSHA_EMAIL = "arusha@toyota.example.test";
const COURIER_EMAIL = "swift@example.test";

let darPartnerId = "";

beforeAll(async () => {
  db = await createTestDatabase("notify-events");
  await seedDatabase(getPrisma());
  ({ partnerId: darPartnerId } = await createTestPartner({ uid: "uid-dar", email: DAR_EMAIL, branchId: "toyota-dar", displayName: "Toyota — Dar es Salaam" }));
  await createTestPartner({ uid: "uid-arusha", email: ARUSHA_EMAIL, branchId: "toyota-arusha", displayName: "Toyota — Arusha" });
  await createTestPartner({ uid: "uid-swift", email: COURIER_EMAIL, kind: "courier", agentId: "arusha-swift-couriers", displayName: "Arusha Swift Couriers" });
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let n = 0;
beforeEach(() => {
  for (const mock of [generateCheckoutLink, sendCustomerEmail, sendNotification, sendPartnerEmail, session]) mock.mockReset();
  generateCheckoutLink.mockImplementation(async () => ({ ok: true, checkoutLink: `https://checkout.clickpesa.com/EVT${++n}` }));
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
  sendPartnerEmail.mockResolvedValue({ sent: true });
  session.mockResolvedValue(ADMIN);
});

const ORDER_INPUT = {
  productId: "toyota-corolla",
  quantity: "1",
  fullName: "Asha Mwenda",
  phone: "0754123456",
  address: "Mikocheni B, near the Shell station",
  agentId: null as string | null,
  // `toyota-dar`'s own city: the action refuses a request that does not say
  // where it is going, and `createOrder` holds the answer to the branch's city.
  deliveryCity: "Dar es Salaam",
  reference: "",
};

/** A signed-in customer's order for a product of `toyota-dar` (own fleet, fully quoted). */
async function order(overrides: Partial<typeof ORDER_INPUT> = {}) {
  const created = await createOrder({ ...ORDER_INPUT, ...overrides, requestedAt: new Date().toISOString() }, CUSTOMER.uid, CUSTOMER.email);
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

/** Confirmed, checkout open, and paid in full. */
async function paidOrder() {
  const o = await order();
  await confirmOrder(o.id, ADMIN.uid);
  await openCheckout(o.id);
  const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
  await capturePayment({ providerRef: payment.providerRef, paymentReference: `CPEVT${++n}`, collectedAmount: payment.amountTZS, source: "webhook" });
  return { ...o, amountTZS: payment.amountTZS };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function application(uid: string, email: string) {
  const outcome = await createApplicationForUser(uid, email, {
    kind: "brand",
    businessName: "Kariakoo Electronics",
    contactName: "Neema Joseph",
    phone: "0754123456",
    city: "Dar es Salaam",
    brandId: "",
    brandOther: "Kariakoo Electronics",
    address: "Kariakoo, Dar es Salaam",
    deliveryMode: "customer_pays",
    notes: "",
  });
  if (!outcome.submitted) throw new Error(`application not submitted: ${outcome.reason}`);
  const row = await getPrisma().partnerApplication.findFirstOrThrow({ where: { uid }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return row.id;
}

describe("where a partner's address comes from", () => {
  it("is the address on the application they were approved from", async () => {
    expect(await partnerContact({ branchId: "toyota-dar" })).toMatchObject({ partnerId: darPartnerId, email: DAR_EMAIL, status: "active" });
    expect(await partnerContact({ agentId: "arusha-swift-couriers" })).toMatchObject({ email: COURIER_EMAIL, kind: "courier" });
    // A seeded branch nobody has claimed: no partner, so nobody to write to.
    expect(await partnerContact({ branchId: "ford-dar" })).toBeNull();
  });
});

describe("partner applications", () => {
  it("emails the applicant when approved, once, at the address they applied from", async () => {
    const id = await application("uid-applicant-1", "neema@kariakoo.example.test");

    await expect(approvePartnerApplication(id)).resolves.toEqual({ ok: true });

    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe("neema@kariakoo.example.test");
    expect(subject).toContain("Kariakoo Electronics is approved");
    expect(body).toContain("Hello Neema,");
    expect(body).toMatch(/\/partner$/m);

    // Approving again is refused, and a refused action tells nobody anything.
    await expect(approvePartnerApplication(id)).resolves.toEqual({ ok: false, reason: "already-reviewed" });
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
  });

  it("emails the applicant the reason when rejected, and refuses a rejection without one", async () => {
    const id = await application("uid-applicant-2", "juma@example.test");

    for (const blank of ["", "  ", "no"]) {
      await expect(rejectPartnerApplication(id, blank)).resolves.toEqual({ ok: false, reason: "reason-required" });
    }
    expect(sendPartnerEmail).not.toHaveBeenCalled();
    expect(await getPrisma().partnerApplication.findUniqueOrThrow({ where: { id }, select: { status: true } })).toEqual({ status: "pending" });

    await expect(rejectPartnerApplication(id, " We could not confirm the shop address ")).resolves.toEqual({ ok: true });

    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe("juma@example.test");
    expect(subject).toContain("Kariakoo Electronics");
    expect(body).toContain("The reason: We could not confirm the shop address");
    expect(body).toMatch(/\/apply$/m);

    await expect(rejectPartnerApplication(id, "Still no")).resolves.toEqual({ ok: false, reason: "already-reviewed" });
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
  });

  it("is refused outright without an admin session, and sends nothing", async () => {
    const id = await application("uid-applicant-3", "third@example.test");
    session.mockResolvedValue(null);
    await expect(approvePartnerApplication(id)).resolves.toEqual({ ok: false, reason: "forbidden" });
    await expect(rejectPartnerApplication(id, "A good reason")).resolves.toEqual({ ok: false, reason: "forbidden" });
    expect(sendPartnerEmail).not.toHaveBeenCalled();
  });

  it("tells a partner when they are on the map", async () => {
    await notifyPartnerActivated(darPartnerId);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe(DAR_EMAIL);
    expect(subject).toContain("is on the map");
    expect(body).toContain("/partner/products/new");
  });

  it("tells a partner when they are suspended, with the reason, and again when reactivated", async () => {
    const { partnerId } = await createTestPartner({ uid: "uid-mwanza", email: "mwanza@toyota.example.test", branchId: "toyota-mwanza", displayName: "Toyota — Mwanza" });

    await setPartnerStatusAction({ status: "idle" }, form({ partnerId, status: "suspended", note: "Three orders left undelivered" }));
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    expect(sendPartnerEmail.mock.calls[0][0]).toBe("mwanza@toyota.example.test");
    expect(sendPartnerEmail.mock.calls[0][1]).toMatch(/suspended/);
    expect(sendPartnerEmail.mock.calls[0][2]).toContain("The reason: Three orders left undelivered");

    // Suspending an already-suspended partner changes nothing and says nothing.
    await setPartnerStatusAction({ status: "idle" }, form({ partnerId, status: "suspended", note: "Again" }));
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);

    await setPartnerStatusAction({ status: "idle" }, form({ partnerId, status: "active", note: "" }));
    expect(sendPartnerEmail).toHaveBeenCalledTimes(2);
    expect(sendPartnerEmail.mock.calls[1][1]).toMatch(/active again/);
  });
});

describe("who may place an order, and where it may go", () => {
  const count = () => getPrisma().order.count();

  // The Terms say a request sent without signing in is not recorded. Until
  // 4 Oct 2026 the action stored it anyway, with no owner.
  it("writes nothing for a caller with no session", async () => {
    session.mockResolvedValue(null);
    const before = await count();

    await expect(submitOrder({ ...ORDER_INPUT, requestedAt: new Date().toISOString() })).resolves.toEqual({ ok: false, reason: "signed-out" });
    expect(await count()).toBe(before);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("refuses a request that does not say which city it is going to", async () => {
    session.mockResolvedValue(CUSTOMER);
    const before = await count();
    const { deliveryCity: _omitted, ...withoutCity } = ORDER_INPUT;
    void _omitted;

    await expect(submitOrder({ ...withoutCity, requestedAt: new Date().toISOString() })).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(submitOrder({ ...ORDER_INPUT, deliveryCity: "  ", requestedAt: new Date().toISOString() })).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(await count()).toBe(before);
  });

  // The live case: a Dodoma shop, an address in Kigoma, and an order that was accepted.
  it("refuses an order going to a city the branch does not deliver in", async () => {
    session.mockResolvedValue(CUSTOMER);
    const before = await count();

    for (const elsewhere of ["Arusha", "elsewhere", "dar es salaam"]) {
      await expect(submitOrder({ ...ORDER_INPUT, deliveryCity: elsewhere, requestedAt: new Date().toISOString() })).resolves.toEqual({ ok: false, reason: "invalid" });
    }
    expect(await count()).toBe(before);
  });
});

describe("a new order", () => {
  it("tells MalFleks only: the customer is on the pay page, and the branch has nothing to do until it is paid", async () => {
    session.mockResolvedValue(CUSTOMER);

    const result = await submitOrder({ ...ORDER_INPUT, requestedAt: new Date().toISOString() });
    if (!result.ok) throw new Error(result.reason);
    expect(result.payNow).toBe(true);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toContain(result.reference);
    expect(sendNotification.mock.calls[0][0]).toMatch(/waiting for payment/);
    expect(sendNotification.mock.calls[0][1]).toContain("/admin/orders");
    for (const personal of ["Asha", "754123456", "Mikocheni"]) {
      expect(sendNotification.mock.calls[0][1]).not.toContain(personal);
    }
    // Not the branch (nothing to answer), and not the customer (they are looking at the pay page).
    expect(sendPartnerEmail).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("asks the branch first when no checkout could be opened, with no customer details in the email", async () => {
    session.mockResolvedValue(CUSTOMER);
    generateCheckoutLink.mockResolvedValue({ ok: false, reason: "request-failed" });

    const result = await submitOrder({ ...ORDER_INPUT, requestedAt: new Date().toISOString() });
    if (!result.ok) throw new Error(result.reason);
    expect(result.payNow).toBe(false);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe(DAR_EMAIL);
    expect(subject).toContain(result.reference);
    expect(subject).toMatch(/please confirm/);
    expect(body).toContain("1 × Toyota Corolla");
    expect(body).toContain("/partner/orders");
    for (const personal of ["Asha", "754123456", "Mikocheni"]) {
      expect(body).not.toContain(personal);
      expect(sendNotification.mock.calls[0][1]).not.toContain(personal);
    }
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("skips the branch silently when it has no partner, or the partner is suspended", async () => {
    // ford-dar is a seeded branch nobody manages.
    const unclaimed = await order({ productId: "ford-ranger" });
    await notifyOfNewOrder(unclaimed.reference, { tellBranch: true });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendPartnerEmail).not.toHaveBeenCalled();

    const { partnerId } = await createTestPartner({ uid: "uid-ford-arusha", email: "arusha@ford.example.test", branchId: "ford-arusha", status: "suspended" });
    expect(partnerId).toBeTruthy();
    // ford-everest is out of stock in the seed, so place the order directly on that branch.
    const mine = await order();
    await getPrisma().order.update({ where: { id: mine.id }, data: { branchId: "ford-arusha" } });
    await notifyOfNewOrder(mine.reference, { tellBranch: true });
    expect(sendPartnerEmail).not.toHaveBeenCalled();
  });

  it("does not tell the branch about an order that is no longer waiting on it", async () => {
    const o = await order();
    await confirmOrder(o.id, ADMIN.uid);
    await notifyOfNewOrder(o.reference, { tellBranch: true });
    expect(sendPartnerEmail).not.toHaveBeenCalled();
  });
});

describe("a payment", () => {
  it("tells the branch to deliver when it runs its own delivery, once", async () => {
    const o = await order();
    await confirmOrder(o.id, ADMIN.uid);
    await openCheckout(o.id);
    const payment = await getPrisma().orderPayment.findFirstOrThrow({ where: { orderId: o.id } });
    sendPartnerEmail.mockClear();

    const capture = { providerRef: payment.providerRef, paymentReference: "CPBRAND1", collectedAmount: payment.amountTZS, source: "webhook" as const };
    await expect(capturePayment(capture)).resolves.toBe("captured");

    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe(DAR_EMAIL);
    expect(subject).toContain(o.reference);
    expect(subject).toMatch(/deliver now/);
    expect(body).toMatch(/Collect nothing at the door/);

    // The webhook delivered twice, and reconciliation arriving afterwards.
    await capturePayment(capture);
    await capturePayment({ ...capture, providerRef: "CPBRAND1", source: "reconcile" });
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
  });

  it("on a courier route, tells the courier to collect and the branch to hand over", async () => {
    // An agent-route order with a full quote, the way `payouts.integration.test.ts` builds one:
    // no city has a delivery fee yet, so the quote is written by hand.
    const o = await order({ productId: "toyota-hilux", agentId: "arusha-swift-couriers", deliveryCity: "Arusha" });
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: o.id },
      data: { unitPriceTZS: 100_000, lineTotalTZS: 100_000, quoteGoodsRungTZS: 6_000, quoteDeliveryFeeTZS: 3_000, quoteDeliveryRungTZS: 500, quoteOrderTotalTZS: 103_000 },
    });
    await confirmOrder(o.id, ADMIN.uid);
    await prisma.orderPayment.create({ data: { orderId: o.id, providerRef: "EVTAGENT1", provider: "clickpesa", amountTZS: 103_000 } });

    await capturePayment({ providerRef: "EVTAGENT1", paymentReference: "CPAGENT1", collectedAmount: 103_000, source: "webhook" });

    expect(sendPartnerEmail).toHaveBeenCalledTimes(2);
    const byAddress = new Map(sendPartnerEmail.mock.calls.map(([to, subject, body]) => [to as string, { subject: subject as string, body: body as string }]));
    expect(byAddress.get(COURIER_EMAIL)?.subject).toMatch(/deliver now/);
    expect(byAddress.get(COURIER_EMAIL)?.body).toMatch(/collect it from/);
    expect(byAddress.get(ARUSHA_EMAIL)?.subject).toMatch(/hand it to the courier/);
    expect(byAddress.get(ARUSHA_EMAIL)?.body).toContain("Arusha Swift Couriers");
  });
});

describe("a cancellation", () => {
  it("tells an unpaid customer they have not been charged", async () => {
    const o = await order();

    await expect(cancelOrderAction(o.id, "Out of stock")).resolves.toEqual({ ok: true });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe(CUSTOMER.email);
    expect(subject).toContain(o.reference);
    expect(subject).toMatch(/cancelled/);
    expect(body).toContain("The reason: Out of stock");
    expect(body).toContain("You have not been charged.");
    expect(body).not.toMatch(/refund/i);

    // Cancelling a cancelled order is refused and sends nothing.
    await expect(cancelOrderAction(o.id, "Out of stock")).resolves.toEqual({ ok: false, reason: "invalid-transition" });
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });

  it("is the same for an order that was confirmed and sent a pay link but never paid", async () => {
    const o = await order();
    await confirmOrder(o.id, ADMIN.uid);
    await openCheckout(o.id);
    sendCustomerEmail.mockClear();

    await cancelOrderAction(o.id, "Customer withdrew");
    expect(sendCustomerEmail.mock.calls[0][2]).toContain("You have not been charged.");
  });

  it("tells a customer who has paid that the payment will be refunded", async () => {
    const o = await paidOrder();
    sendCustomerEmail.mockClear();

    await expect(cancelOrderAction(o.id, "The branch cannot deliver it")).resolves.toEqual({ ok: true });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const body = sendCustomerEmail.mock.calls[0][2] as string;
    expect(body).toContain("The reason: The branch cannot deliver it");
    expect(body).toContain("Your payment will be refunded");
    expect(body).not.toContain("You have not been charged");
  });

  it("sends nothing when the order has no address on file", async () => {
    const created = await createOrder({ ...ORDER_INPUT, requestedAt: new Date().toISOString() }, CUSTOMER.uid, null);
    if (!created.ok) throw new Error(created.reason);
    // The real sender is what refuses a missing address; let it run.
    const actual = await vi.importActual<typeof import("./email")>("./email");
    sendCustomerEmail.mockImplementation((...args: Parameters<typeof actual.sendCustomerEmail>) => actual.sendCustomerEmail(...args));

    await expect(cancelOrderAction(created.value.id, "Out of stock")).resolves.toEqual({ ok: true });
    await expect(sendCustomerEmail.mock.results[0].value).resolves.toEqual({ sent: false, reason: "no-address" });
  });
});

describe("a refund", () => {
  it("tells the customer the amount and the reference, once it is recorded", async () => {
    const o = await paidOrder();
    await cancelOrderAction(o.id, "The branch cannot deliver it");
    sendCustomerEmail.mockClear();

    const state = await recordRefundAction({ status: "idle" }, form({ orderId: o.id, amount: String(o.amountTZS), reference: "RFND-7781" }));
    expect(state).toEqual({ status: "ok", message: "Refund recorded." });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe(CUSTOMER.email);
    expect(subject).toContain(o.reference);
    expect(body).toContain("TSh 68,000,000");
    expect(body).toContain("Refund reference: RFND-7781");

    // Nothing is left to refund, so a second attempt records nothing and sends nothing.
    const again = await recordRefundAction({ status: "idle" }, form({ orderId: o.id, amount: "1000", reference: "RFND-7782" }));
    expect(again.status).toBe("error");
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });
});

describe("a delivery", () => {
  it("thanks the customer and leaves them the track link, once", async () => {
    const o = await order();
    await confirmOrder(o.id, ADMIN.uid);

    await expect(markFulfilledAction(o.id)).resolves.toEqual({ ok: true });

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe(CUSTOMER.email);
    expect(subject).toMatch(/delivered/);
    expect(body).toMatch(/Thank you/);
    expect(body).toContain(`/track/${o.reference}`);

    await expect(markFulfilledAction(o.id)).resolves.toEqual({ ok: false, reason: "invalid-transition" });
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });
});

describe("a payout", () => {
  it("tells the partner the amount and the reference when it is marked sent, and not again", async () => {
    const o = await paidOrder();
    await markOrderFulfilled(o.id, ADMIN.uid);

    const batch = await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, ADMIN.uid);
    if (!batch.ok) throw new Error(batch.reason);
    sendPartnerEmail.mockClear();

    const state = await markPayoutPaidAction({ status: "idle" }, form({ batchId: batch.batchId, reference: "CPPAYOUT-4471" }));
    expect(state).toEqual({ status: "ok", message: "Recorded as sent." });

    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe(DAR_EMAIL);
    expect(subject).toContain("CPPAYOUT-4471");
    expect(subject).toContain(`TSh ${batch.totalTZS.toLocaleString("en-US")}`);
    expect(body).toContain("Payout reference: CPPAYOUT-4471");

    // Already recorded: the second press is refused and nobody is emailed twice.
    const again = await markPayoutPaidAction({ status: "idle" }, form({ batchId: batch.batchId, reference: "CPPAYOUT-4472" }));
    expect(again.status).toBe("error");
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
  });
});

describe("a product decision", () => {
  async function submission(status: string, extra: { decisionNote?: string; publishedProductId?: string } = {}) {
    const row = await getPrisma().productSubmission.create({
      data: {
        partnerId: darPartnerId,
        branchId: "toyota-dar",
        brandId: "toyota",
        status,
        name: "Toyota Vitz",
        category: "Sedan",
        priceTZS: 24_000_000,
        image: "sedan",
        description: "A small, economical hatchback for the city.",
        ...extra,
      },
      select: { id: true },
    });
    return row.id;
  }

  it("tells the partner a published product is on sale, with its page", async () => {
    await notifyProductDecision(await submission("published", { publishedProductId: "toyota-vitz-toyota-dar" }));
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe(DAR_EMAIL);
    expect(subject).toContain("Toyota Vitz is now on sale");
    expect(body).toContain("/products/toyota-vitz-toyota-dar");
  });

  it("sends a product back with the reason, refuses to without one, and says nothing while it is still pending", async () => {
    const id = await submission("pending");
    await notifyProductDecision(id);
    expect(sendPartnerEmail).not.toHaveBeenCalled();

    await expect(rejectProductSubmission(id, " ")).resolves.toEqual({ ok: false, reason: "reason-required" });
    expect(sendPartnerEmail).not.toHaveBeenCalled();

    await expect(rejectProductSubmission(id, "The price looks like a typo")).resolves.toEqual({ ok: true });
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendPartnerEmail.mock.calls[0];
    expect(to).toBe(DAR_EMAIL);
    expect(subject).toContain("Toyota Vitz was sent back");
    expect(body).toContain("The reason: The price looks like a typo");

    await expect(rejectProductSubmission(id, "The price looks like a typo")).resolves.toEqual({ ok: false, reason: "already-reviewed" });
    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
  });
});

describe("a provider that is down", () => {
  it("never fails the action that triggered the email", async () => {
    sendCustomerEmail.mockRejectedValue(new Error("ECONNRESET"));
    sendPartnerEmail.mockRejectedValue(new Error("ECONNRESET"));
    sendNotification.mockRejectedValue(new Error("ECONNRESET"));

    const o = await order();
    await expect(cancelOrderAction(o.id, "Out of stock")).resolves.toEqual({ ok: true });
    expect(await getPrisma().order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true } })).toEqual({ status: "cancelled" });

    const id = await application("uid-applicant-4", "fourth@example.test");
    await expect(approvePartnerApplication(id)).resolves.toEqual({ ok: true });

    session.mockResolvedValue(CUSTOMER);
    await expect(submitOrder({ ...ORDER_INPUT, requestedAt: new Date().toISOString() })).resolves.toMatchObject({ ok: true });
  });
});
