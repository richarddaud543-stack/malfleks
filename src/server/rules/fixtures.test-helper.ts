import { getPrisma } from "@/server/db/client";
import { createOrder } from "@/server/orders/create-order";
import { confirmOrder } from "@/server/orders/status";
import { capturePayment } from "@/server/payments/settle";

/**
 * Orders in the states the rulebook cares about, for its integration tests.
 *
 * Built through the real functions (`createOrder`, `capturePayment`) wherever
 * the state matters, and then *aged* by writing timestamps directly: the
 * rules are all about how long ago something happened, and no test should
 * wait five days to find out.
 */

export const SHOP = "toyota-dar";
export const PAYER = "255754123456";

let sequence = 0;
function next(): number {
  sequence += 1;
  return sequence;
}

export interface PlacedOrder {
  id: string;
  reference: string;
}

/** A signed-in customer's order for 50,000 TSh of goods, priced, not yet given a pay link. */
export async function placedOrder(options: { totalTZS?: number; createdAt?: Date } = {}): Promise<PlacedOrder> {
  const total = options.totalTZS ?? 50_000;
  const created = await createOrder(
    { productId: "toyota-corolla", quantity: "1", fullName: "Asha Mwenda", phone: "0754123456", address: "Mikocheni B", agentId: null, reference: "", requestedAt: new Date().toISOString() },
    null,
  );
  if (!created.ok) throw new Error(`fixture: ${created.reason}`);
  const order = await getPrisma().order.update({
    where: { id: created.value.id },
    data: {
      customerId: `customer-${next()}`,
      customerEmail: "asha@example.com",
      unitPriceTZS: total,
      lineTotalTZS: total,
      routeKind: "brand",
      agentId: null,
      quoteGoodsRungTZS: 3_000,
      quoteDeliveryFeeTZS: 0,
      quoteDeliveryRungTZS: 0,
      quoteOrderTotalTZS: total,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
    select: { id: true, reference: true },
  });
  return order;
}

/** The same order with a pay link made at `since` and nothing paid. */
export async function unpaidOrder(since: Date, options: { totalTZS?: number } = {}): Promise<PlacedOrder & { paymentId: string }> {
  const order = await placedOrder({ ...options, createdAt: since });
  const payment = await getPrisma().orderPayment.create({
    data: { orderId: order.id, providerRef: `UNPAID${next()}X${Date.now()}`, provider: "clickpesa", amountTZS: options.totalTZS ?? 50_000, checkoutLink: "https://pay.example/x", initiatedAt: since },
    select: { id: true },
  });
  return { ...order, paymentId: payment.id };
}

/** An order the customer paid for at `paidAt`, confirmed and not delivered. */
export async function paidOrder(paidAt: Date, options: { totalTZS?: number; payerPhone?: string | null } = {}): Promise<PlacedOrder> {
  const total = options.totalTZS ?? 50_000;
  const order = await placedOrder({ totalTZS: total, createdAt: paidAt });
  const prisma = getPrisma();
  await confirmOrder(order.id, "admin-1");
  const providerRef = `PAID${next()}X${Date.now()}`;
  await prisma.orderPayment.create({ data: { orderId: order.id, providerRef, provider: "clickpesa", amountTZS: total, initiatedAt: paidAt } });
  const outcome = await capturePayment({
    providerRef,
    paymentReference: `CP${providerRef}`,
    collectedAmount: total,
    payerPhone: options.payerPhone === undefined ? PAYER : options.payerPhone,
    source: "webhook",
  });
  if (outcome !== "captured") throw new Error(`fixture: capture was ${outcome}`);
  await prisma.orderPayment.updateMany({ where: { orderId: order.id }, data: { capturedAt: paidAt } });
  await prisma.ledgerEntry.updateMany({ where: { orderId: order.id }, data: { createdAt: paidAt } });
  return order;
}

/** The shop's own sign-in, with an address on file so it can be written to. */
export async function shopUser(branchId: string = SHOP): Promise<{ uid: string; email: string }> {
  const n = next();
  const uid = `uid-shop-${n}-${Date.now()}`;
  const email = `shop${n}@example.com`;
  const prisma = getPrisma();
  const application = await prisma.partnerApplication.create({
    data: { kind: "brand", status: "approved", uid, email, businessName: "Toyota Dar", contactName: "Juma", phone: "+255754000111", city: "Dar es Salaam" },
    select: { id: true },
  });
  await prisma.partner.create({
    data: {
      kind: "brand",
      status: "active",
      displayName: "Toyota Dar",
      contactName: "Juma",
      phone: "+255754000111",
      city: "Dar es Salaam",
      brandId: "toyota",
      branchId,
      applicationId: application.id,
      approvedBy: "admin-0",
      users: { create: { uid, role: "owner" } },
    },
  });
  return { uid, email };
}

/** Empty every table a rule reads or writes, so each test sees only what it made. */
export async function resetRulebookTables(): Promise<void> {
  const prisma = getPrisma();
  await prisma.refundSend.deleteMany({});
  await prisma.ledgerEntry.deleteMany({});
  await prisma.payoutBatch.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.ownerAlert.deleteMany({});
  await prisma.ruleMark.deleteMany({});
  await prisma.ruleRun.deleteMany({});
  await prisma.appSetting.deleteMany({});
  await prisma.partner.deleteMany({});
  await prisma.partnerApplication.deleteMany({});
  await prisma.product.updateMany({ where: { hiddenAt: { not: null } }, data: { hiddenAt: null } });
}
