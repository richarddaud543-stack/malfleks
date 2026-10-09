// @vitest-environment node
//
// Real Postgres. The shop's answer about who pays for delivery, followed from
// the moment it registers to the moment the money is split.
//
// The chain this covers is the one that can quietly cost somebody money:
//
//   application.deliveryMode → Partner.deliveryMode → the order's frozen
//   quote columns → splitForFulfilment's branch and courier figures
//
// Two properties are load-bearing and each has its own test below:
//
//   * the figures are FROZEN on the order. A shop that changes its mind
//     tomorrow must not re-price an order that is already paid for.
//   * the courier is paid the same under all three answers. A deal between the
//     shop and the customer is not the delivery person's problem.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { CITY_DELIVERY_FEES, type DeliveryMode } from "@/lib/fees";
import { splitForFulfilment } from "@/server/money/payout-rules";
import { createApplicationForUser } from "@/server/partners/applications";
import { approveApplication } from "@/server/partners/review";
import { createOrder } from "./create-order";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("delivery_mode");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.order.deleteMany({});
  await prisma.partnerUser.deleteMany({});
  await prisma.partner.deleteMany({});
  await prisma.partnerApplication.deleteMany({});
});

const ADMIN = "uid-admin";
let seq = 0;

/** A branch from the seed catalogue that the partner rows can be wired to. */
async function seededBranch() {
  return getPrisma().branch.findFirstOrThrow({ select: { id: true, city: true } });
}

/** An approved brand partner whose shop answered `mode`, wired to `branchId`. */
async function approvedShop(mode: DeliveryMode | "", branchId: string) {
  seq += 1;
  const uid = `uid-shop-${seq}-${Date.now()}`;
  const submitted = await createApplicationForUser(uid, `shop${seq}@example.com`, {
    kind: "brand",
    businessName: `Shop ${seq}`,
    contactName: "Neema Mushi",
    phone: "0754123456",
    city: "Arusha",
    brandId: "toyota",
    brandOther: "",
    address: "Sokoine Road, Arusha",
    deliveryMode: mode,
    notes: "",
  });
  if (!submitted.submitted) throw new Error(submitted.reason);

  const approved = await approveApplication(submitted.id, ADMIN);
  if (!approved.ok) throw new Error(approved.reason);

  // Wiring the partner to a catalogue branch is normally a second, deliberate
  // admin step. Done directly here because it is not what this file is testing.
  await getPrisma().partner.updateMany({
    where: { applicationId: submitted.id },
    data: { branchId },
  });

  return { uid, applicationId: submitted.id };
}

describe("the shop's answer reaches its Partner row", () => {
  it("carries each of the three answers through approval", async () => {
    const branch = await seededBranch();
    for (const mode of ["customer_pays", "split", "shop_delivers"] as const) {
      const { applicationId } = await approvedShop(mode, branch.id);
      const partner = await getPrisma().partner.findFirstOrThrow({
        where: { applicationId },
        select: { deliveryMode: true },
      });
      expect(partner.deliveryMode, mode).toBe(mode);
    }
  });

  it("falls back to customer_pays for a courier, which is never asked", async () => {
    seq += 1;
    const uid = `uid-courier-${seq}-${Date.now()}`;
    const submitted = await createApplicationForUser(uid, `courier${seq}@example.com`, {
      kind: "courier",
      businessName: "Arusha Riders",
      contactName: "Juma Said",
      phone: "0755111222",
      city: "Arusha",
      brandId: "",
      brandOther: "",
      address: "",
      deliveryMode: "",
      notes: "",
    });
    if (!submitted.submitted) throw new Error(submitted.reason);
    const approved = await approveApplication(submitted.id, ADMIN);
    expect(approved.ok).toBe(true);

    const partner = await getPrisma().partner.findFirstOrThrow({
      where: { applicationId: submitted.id },
      select: { kind: true, deliveryMode: true },
    });
    expect(partner.kind).toBe("courier");
    expect(partner.deliveryMode).toBe("customer_pays");
  });

  it("drops a courier's stray delivery answer rather than storing it", async () => {
    seq += 1;
    const uid = `uid-courier-stray-${seq}-${Date.now()}`;
    const submitted = await createApplicationForUser(uid, `stray${seq}@example.com`, {
      kind: "courier",
      businessName: "Mwanza Riders",
      contactName: "Juma Said",
      phone: "0755111333",
      city: "Mwanza",
      brandId: "",
      brandOther: "",
      address: "",
      // A hand-edited form could send this. A courier does not get to decide
      // that MalFleks's customers pay nothing for delivery.
      deliveryMode: "shop_delivers",
      notes: "",
    });
    if (!submitted.submitted) throw new Error(submitted.reason);

    const application = await getPrisma().partnerApplication.findUniqueOrThrow({
      where: { id: submitted.id },
      select: { deliveryMode: true },
    });
    expect(application.deliveryMode).toBeNull();
  });
});

describe("the order freezes the figures", () => {
  /** One order for the seeded branch, at a price the goods ladder covers. */
  async function order(branchCity: string) {
    const product = await getPrisma().product.findFirstOrThrow({
      where: { branch: { city: branchCity } },
      select: { id: true },
    });
    seq += 1;
    const created = await createOrder(
      {
        productId: product.id,
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
    return created.value.id;
  }

  it("stores the customer's and the shop's share, and they add up to the fee", async () => {
    const branch = await seededBranch();
    await approvedShop("split", branch.id);

    const id = await order(branch.city);
    const row = await getPrisma().order.findUniqueOrThrow({
      where: { id },
      select: {
        routeKind: true,
        quoteDeliveryFeeTZS: true,
        quoteCustomerDeliveryTZS: true,
        quoteShopDeliveryShareTZS: true,
        quoteDeliveryMode: true,
        quoteOrderTotalTZS: true,
        lineTotalTZS: true,
      },
    });

    // Every city's fee is still unset, so a quote only exists on a brand route
    // where the fee is zero either way. That is the honest state of the fee
    // table today and the assertions below hold whichever way it goes.
    if (row.quoteOrderTotalTZS === null) {
      expect(row.quoteCustomerDeliveryTZS).toBeNull();
      expect(row.quoteShopDeliveryShareTZS).toBeNull();
      expect(row.quoteDeliveryMode).toBeNull();
      return;
    }

    expect(row.quoteDeliveryMode).toBe("split");
    expect(
      (row.quoteCustomerDeliveryTZS ?? 0) + (row.quoteShopDeliveryShareTZS ?? 0),
    ).toBe(row.quoteDeliveryFeeTZS ?? 0);
    expect(row.quoteOrderTotalTZS).toBe(
      row.lineTotalTZS + (row.quoteCustomerDeliveryTZS ?? 0),
    );
  });

  it("does not re-price an existing order when the shop changes its answer", async () => {
    const branch = await seededBranch();
    const { applicationId } = await approvedShop("customer_pays", branch.id);
    const id = await order(branch.city);

    const before = await getPrisma().order.findUniqueOrThrow({
      where: { id },
      select: {
        quoteCustomerDeliveryTZS: true,
        quoteShopDeliveryShareTZS: true,
        quoteDeliveryMode: true,
        quoteOrderTotalTZS: true,
      },
    });

    await getPrisma().partner.updateMany({
      where: { applicationId },
      data: { deliveryMode: "shop_delivers" },
    });

    const after = await getPrisma().order.findUniqueOrThrow({
      where: { id },
      select: {
        quoteCustomerDeliveryTZS: true,
        quoteShopDeliveryShareTZS: true,
        quoteDeliveryMode: true,
        quoteOrderTotalTZS: true,
      },
    });
    expect(after).toEqual(before);
  });

  it("still takes an order from a branch with no partner row at all", async () => {
    // The seed catalogue's branches have none. An order must not fail because
    // nobody has answered a question that did not exist last week.
    const branch = await seededBranch();
    const id = await order(branch.city);
    expect(id).toBeTruthy();
  });
});

describe("splitForFulfilment honours the shop's share", () => {
  // Worked against figures rather than the live fee table, which is still
  // unset: these are the numbers a 5,000 TZS Dar delivery would produce.
  const base = {
    routeKind: "agent",
    lineTotalTZS: 80_000,
    quoteGoodsRungTZS: 6_000,
    quoteDeliveryFeeTZS: 5_000,
    quoteDeliveryRungTZS: 1_500,
  };

  it("pays the shop less and the courier the same under split", () => {
    const customerPays = splitForFulfilment(
      { ...base, quoteShopDeliveryShareTZS: 0, quoteOrderTotalTZS: 85_000 },
      85_000,
    );
    const halved = splitForFulfilment(
      { ...base, quoteShopDeliveryShareTZS: 2_500, quoteOrderTotalTZS: 82_500 },
      82_500,
    );

    expect(customerPays).toEqual({
      ok: true,
      split: { branchTZS: 74_000, courierTZS: 3_500, feeTZS: 7_500 },
    });
    expect(halved).toEqual({
      ok: true,
      split: { branchTZS: 71_500, courierTZS: 3_500, feeTZS: 7_500 },
    });
  });

  it("takes the whole fee off the shop under shop_delivers", () => {
    expect(
      splitForFulfilment(
        { ...base, quoteShopDeliveryShareTZS: 5_000, quoteOrderTotalTZS: 80_000 },
        80_000,
      ),
    ).toEqual({ ok: true, split: { branchTZS: 69_000, courierTZS: 3_500, feeTZS: 7_500 } });
  });

  it("reads a null share as zero, so an order from before 6 Oct 2026 splits as it did", () => {
    expect(
      splitForFulfilment({ ...base, quoteShopDeliveryShareTZS: null, quoteOrderTotalTZS: 85_000 }, 85_000),
    ).toEqual({ ok: true, split: { branchTZS: 74_000, courierTZS: 3_500, feeTZS: 7_500 } });
  });

  it("refuses a share that does not reconcile with the order total", () => {
    // The guard that catches a hand-written or half-migrated row: if the three
    // shares do not add back up to what the customer paid, nothing moves.
    expect(
      splitForFulfilment(
        { ...base, quoteShopDeliveryShareTZS: 2_500, quoteOrderTotalTZS: 85_000 },
        85_000,
      ),
    ).toEqual({ ok: false, reason: "bad-quote" });
  });

  it("refuses a negative share", () => {
    expect(
      splitForFulfilment(
        { ...base, quoteShopDeliveryShareTZS: -2_500, quoteOrderTotalTZS: 87_500 },
        87_500,
      ),
    ).toEqual({ ok: false, reason: "bad-quote" });
  });

  it("refuses when the share would leave the shop owing money", () => {
    expect(
      splitForFulfilment(
        {
          routeKind: "agent",
          lineTotalTZS: 5_000,
          quoteGoodsRungTZS: 500,
          quoteDeliveryFeeTZS: 5_000,
          quoteDeliveryRungTZS: 1_500,
          quoteShopDeliveryShareTZS: 5_000,
          quoteOrderTotalTZS: 5_000,
        },
        5_000,
      ),
    ).toEqual({ ok: false, reason: "bad-quote" });
  });
});

describe("the fee table itself", () => {
  it("is still unset, so this change charges no customer anything yet", () => {
    // The owner said he will give the four numbers. Until he does, the code
    // above is wired and dormant -- which is the state he asked for, and worth
    // asserting so nobody assumes delivery is live.
    for (const [city, fee] of Object.entries(CITY_DELIVERY_FEES)) {
      expect(fee, city).toBeNull();
    }
  });
});
