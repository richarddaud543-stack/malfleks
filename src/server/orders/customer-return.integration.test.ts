// @vitest-environment node
//
// Real Postgres; the email provider is mocked. What is being proved: a
// customer can ask to return only their own order, only once it is delivered,
// only within the seven days the Electronic Transactions Act gives (s.30), and
// only once -- and asking reaches the owner as an alert and the customer as an
// email, while changing nothing on the order itself.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createOrder } from "./create-order";
import { RETURN_ALERT_KEY, requestReturnAsCustomer } from "./customer-return";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("customer_return");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(() => {
  sendCustomerEmail.mockReset().mockResolvedValue({ sent: true });
  sendNotification.mockReset().mockResolvedValue({ sent: true });
});

const ASHA = "uid-asha";
const DAY = 24 * 60 * 60_000;

/** A real order by Asha, then recorded as delivered at `deliveredAt` (or left as it is). */
async function order(deliveredAt: Date | null) {
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
    ASHA,
    "asha@example.test",
  );
  if (!created.ok) throw new Error(created.reason);
  if (deliveredAt) {
    await getPrisma().order.update({ where: { id: created.value.id }, data: { status: "fulfilled", decidedAt: deliveredAt } });
  }
  return created.value;
}

describe("asking to return a delivered order", () => {
  it("reaches the owner as an alert and the customer as an email, and changes nothing on the order", async () => {
    const delivered = new Date(Date.now() - 2 * DAY);
    const o = await order(delivered);

    await expect(requestReturnAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true });

    const alert = await getPrisma().ownerAlert.findFirst({ where: { key: RETURN_ALERT_KEY, openKey: `${RETURN_ALERT_KEY}:${o.id}` } });
    expect(alert?.status).toBe("open");
    expect(alert?.subject).toContain(o.reference);
    expect(alert?.body).toMatch(/Electronic Transactions Act s\.30/);
    expect(alert?.body).toMatch(/within 30 days/);
    expect(alert?.href).toBe(`/admin/orders/${o.id}`);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, , body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe("asha@example.test");
    expect(body).toMatch(/no later than 30 days/);
    expect(body).toMatch(/si zaidi ya siku 30/);

    const after = await getPrisma().order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe("fulfilled");
  });

  it("is asked once: pressing again does not raise a second alert or a second email", async () => {
    const o = await order(new Date(Date.now() - DAY));
    await expect(requestReturnAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: true });
    await expect(requestReturnAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: false, reason: "already-asked" });
    expect(await getPrisma().ownerAlert.count({ where: { key: RETURN_ALERT_KEY, openKey: `${RETURN_ALERT_KEY}:${o.id}` } })).toBe(1);
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });

  it("is open for seven days after delivery and closed after", async () => {
    const delivered = new Date("2026-10-01T09:00:00Z");
    const inTime = await order(delivered);
    const late = await order(delivered);

    await expect(requestReturnAsCustomer(ASHA, inTime.reference, delivered.getTime() + 7 * DAY)).resolves.toEqual({ ok: true });
    await expect(requestReturnAsCustomer(ASHA, late.reference, delivered.getTime() + 7 * DAY + 60_000)).resolves.toEqual({
      ok: false,
      reason: "too-late",
    });
  });

  it("has nothing to return before delivery", async () => {
    const o = await order(null);
    await expect(requestReturnAsCustomer(ASHA, o.reference)).resolves.toEqual({ ok: false, reason: "not-delivered" });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("is only ever about the customer's own order", async () => {
    const o = await order(new Date(Date.now() - DAY));
    await expect(requestReturnAsCustomer("uid-someone-else", o.reference)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(requestReturnAsCustomer(ASHA, "NOT-A-REAL-REF")).resolves.toEqual({ ok: false, reason: "not-found" });
    // An empty reference matches no order, rather than the first one on the account.
    await expect(requestReturnAsCustomer(ASHA, "")).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
