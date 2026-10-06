// @vitest-environment node
//
// Real Postgres, real checksum. ClickPesa tells MalFleks what became of a
// payout by calling this route, and a mobile-money payout reported as sent can
// still be reversed afterwards -- so the route has to be able to put money
// back to "owed", and must not do it for a caller who cannot sign.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createPayoutBatch, listOwed } from "@/server/money/payouts";
import { createOrder } from "@/server/orders/create-order";
import { confirmOrder, markOrderFulfilled } from "@/server/orders/status";
import { createChecksum } from "@/server/payments/clickpesa";
import { capturePayment } from "@/server/payments/settle";
import { POST } from "./route";

let db: TestDatabase;
let savedSecret: string | undefined;

beforeAll(async () => {
  savedSecret = process.env.CLICKPESA_CHECKSUM_SECRET;
  process.env.CLICKPESA_CHECKSUM_SECRET = "route-test-secret";
  db = await createTestDatabase("clickpesa_route");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  if (savedSecret === undefined) delete process.env.CLICKPESA_CHECKSUM_SECRET;
  else process.env.CLICKPESA_CHECKSUM_SECRET = savedSecret;
  await db.teardown();
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.ledgerEntry.deleteMany({});
  await prisma.payoutBatch.deleteMany({});
  await prisma.order.deleteMany({});
});

let sequence = 0;

/** A delivered, paid order whose shop share (94,000) is in a payout MalFleks is sending. */
async function sendingBatch(sendRef: string) {
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
  await prisma.order.update({
    where: { id: created.value.id },
    data: {
      unitPriceTZS: 100_000,
      lineTotalTZS: 100_000,
      routeKind: "brand",
      agentId: null,
      quoteGoodsRungTZS: 6_000,
      quoteDeliveryFeeTZS: 0,
      quoteDeliveryRungTZS: 0,
      quoteOrderTotalTZS: 100_000,
    },
  });
  await confirmOrder(created.value.id, "admin-1");
  sequence += 1;
  const providerRef = `ROUTE${sequence}X${Date.now()}`;
  await prisma.orderPayment.create({
    data: { orderId: created.value.id, providerRef, provider: "clickpesa", amountTZS: 100_000 },
  });
  await capturePayment({ providerRef, paymentReference: `CP${providerRef}`, collectedAmount: 100_000, source: "webhook" });
  await markOrderFulfilled(created.value.id, "admin-1");
  const batch = await createPayoutBatch({ payeeType: "branch", payeeId: "toyota-dar" }, "system:auto-payout");
  if (!batch.ok) throw new Error(batch.reason);
  await prisma.payoutBatch.update({
    where: { id: batch.batchId },
    data: { status: "sending", sendRef, sendStartedAt: new Date() },
  });
  return batch.batchId;
}

function signed(event: string, data: Record<string, unknown>): Request {
  const body = { event, data: { ...data, checksum: createChecksum(data), checksumMethod: "canonical" } };
  return new Request("https://malfleks.example/api/payments/clickpesa", { method: "POST", body: JSON.stringify(body) });
}

const batchRow = (id: string) => getPrisma().payoutBatch.findUniqueOrThrow({ where: { id } });
const owed = async () => (await listOwed()).payees.reduce((sum, p) => sum + p.totalTZS, 0);

describe("payout notices from ClickPesa", () => {
  it("marks a payout paid when ClickPesa reports success", async () => {
    const id = await sendingBatch("PROUTEOK1");

    const response = await POST(signed("PAYOUT INITIATED", { id: "CPX1", orderReference: "PROUTEOK1", status: "SUCCESS", fee: "1500.00" }));

    expect(response.status).toBe(200);
    expect(await batchRow(id)).toMatchObject({ status: "paid", providerRef: "CPX1", feeTZS: 1500 });
    expect(await owed()).toBe(0);
  });

  it("leaves it on its way while ClickPesa is still processing", async () => {
    const id = await sendingBatch("PROUTEWAIT1");
    await POST(signed("PAYOUT INITIATED", { id: "CPX2", orderReference: "PROUTEWAIT1", status: "PROCESSING" }));
    expect((await batchRow(id)).status).toBe("sending");
  });

  it("puts the money back to owed when a payout is reversed, even after it was marked paid", async () => {
    const id = await sendingBatch("PROUTEREV1");
    await POST(signed("PAYOUT INITIATED", { id: "CPX3", orderReference: "PROUTEREV1", status: "SUCCESS" }));
    expect((await batchRow(id)).status).toBe("paid");

    await POST(signed("PAYOUT REVERSED", { id: "CPX3", orderReference: "PROUTEREV1" }));

    expect(await batchRow(id)).toMatchObject({ status: "failed", providerRef: null });
    expect(await owed()).toBe(94_000);
  });

  it("does the same for a refunded payout", async () => {
    const id = await sendingBatch("PROUTEREF1");
    await POST(signed("PAYOUT REFUNDED", { id: "CPX4", orderReference: "PROUTEREF1", status: "REFUNDED" }));
    expect((await batchRow(id)).status).toBe("failed");
    expect(await owed()).toBe(94_000);
  });

  it("is idempotent: the same notice twice changes nothing more", async () => {
    const id = await sendingBatch("PROUTETWICE1");
    const notice = () => signed("PAYOUT INITIATED", { id: "CPX5", orderReference: "PROUTETWICE1", status: "SUCCESS" });
    await POST(notice());
    const first = await batchRow(id);
    await POST(notice());
    expect(await batchRow(id)).toEqual(first);
  });

  it("acknowledges and ignores a payout that is not one of ours", async () => {
    const id = await sendingBatch("PROUTEMINE1");
    const response = await POST(signed("PAYOUT INITIATED", { id: "CPX6", orderReference: "SOMEBODYELSES", status: "SUCCESS" }));
    expect(response.status).toBe(200);
    expect((await batchRow(id)).status).toBe("sending");
  });

  it("refuses an unsigned notice, and changes nothing", async () => {
    const id = await sendingBatch("PROUTEFORGED1");
    const forged = new Request("https://malfleks.example/api/payments/clickpesa", {
      method: "POST",
      body: JSON.stringify({
        event: "PAYOUT INITIATED",
        data: { id: "X", orderReference: "PROUTEFORGED1", status: "SUCCESS", checksum: "0".repeat(64) },
      }),
    });

    const response = await POST(forged);

    expect(response.status).toBe(400);
    expect((await batchRow(id)).status).toBe("sending");
  });
});
