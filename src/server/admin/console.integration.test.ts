// @vitest-environment node
//
// Real Postgres: the catalogue and partner controls change what customers and
// partners can do, so what's checked here is the effect, not the write.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createOrder } from "@/server/orders/create-order";
import { getAllProducts, getProductById, getProductsByBranchId } from "@/server/repositories";
import { searchCatalogue, setProductHidden, setProductStock, updateProduct } from "./catalogue";
import { getOrderDetail, searchOrders } from "./orders";
import { listBrands, setPartnerStatus } from "./partners";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("admin_console");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const ORDER_INPUT = {
  productId: "toyota-prado",
  quantity: "1",
  fullName: "Baraka Juma",
  phone: "0754987654",
  address: "Sinza, near the market",
  agentId: null,
  reference: "",
  requestedAt: new Date().toISOString(),
};

describe("hiding a product", () => {
  it("takes it off every shop read and stops it being ordered, and putting it back reverses that", async () => {
    expect(await getProductById("ford-ranger")).toBeDefined();

    await expect(setProductHidden("ford-ranger", true)).resolves.toEqual({ ok: true });
    expect(await getProductById("ford-ranger")).toBeUndefined();
    expect((await getAllProducts()).some((p) => p.id === "ford-ranger")).toBe(false);
    expect((await getProductsByBranchId("ford-dar")).some((p) => p.id === "ford-ranger")).toBe(false);

    const blocked = await createOrder({ ...ORDER_INPUT, productId: "ford-ranger" }, null);
    expect(blocked.ok).toBe(false);

    // Still in the console, marked hidden.
    const inConsole = await searchCatalogue({ show: "hidden" });
    expect(inConsole.rows.map((r) => r.id)).toContain("ford-ranger");

    // Hiding twice is fine; a missing product is not.
    await expect(setProductHidden("ford-ranger", true)).resolves.toEqual({ ok: true });
    await expect(setProductHidden("no-such-product", true)).resolves.toEqual({ ok: false });

    await setProductHidden("ford-ranger", false);
    expect(await getProductById("ford-ranger")).toBeDefined();
  });

  it("brand counts know about hidden products", async () => {
    await setProductHidden("ford-territory", true);
    const ford = (await listBrands()).find((b) => b.id === "ford");
    expect(ford?.hiddenProducts).toBe(1);
    await setProductHidden("ford-territory", false);
  });
});

describe("editing a product", () => {
  it("changes the listing but never an order already placed", async () => {
    const placed = await createOrder(ORDER_INPUT, null);
    if (!placed.ok) throw new Error(placed.reason);
    const before = await getPrisma().order.findUniqueOrThrow({ where: { id: placed.value.id } });

    const result = await updateProduct("toyota-prado", {
      name: "Land Cruiser Prado TX",
      priceTZS: "150000000",
      description: "A rugged, spacious SUV trusted across East Africa.",
      inStock: true,
    });
    expect(result).toEqual({ ok: true });
    expect((await getProductById("toyota-prado"))?.priceTZS).toBe(150_000_000);

    const after = await getPrisma().order.findUniqueOrThrow({ where: { id: placed.value.id } });
    expect(after.unitPriceTZS).toBe(before.unitPriceTZS);
    expect(after.productName).toBe(before.productName);
  });

  it("refuses a bad price without writing anything", async () => {
    await expect(
      updateProduct("toyota-prado", { name: "X", priceTZS: "free", description: "Nothing to see here at all.", inStock: true }),
    ).resolves.toEqual({ ok: false, reason: "bad-name" });
    await expect(
      updateProduct("toyota-prado", { name: "Prado", priceTZS: "free", description: "Nothing to see here at all.", inStock: true }),
    ).resolves.toEqual({ ok: false, reason: "bad-price" });
    expect((await getProductById("toyota-prado"))?.name).toBe("Land Cruiser Prado TX");
  });

  it("toggles stock", async () => {
    await setProductStock("toyota-hilux", false);
    expect((await getProductById("toyota-hilux"))?.inStock).toBe(false);
    await setProductStock("toyota-hilux", true);
  });
});

describe("finding orders", () => {
  it("finds an order by the customer's phone however it is typed, and opens it", async () => {
    const placed = await createOrder(ORDER_INPUT, null);
    if (!placed.ok) throw new Error(placed.reason);

    for (const q of ["0754987654", "+255 754 987 654", "754987654", placed.value.reference.toLowerCase()]) {
      const found = await searchOrders({ q });
      expect(found.rows.map((r) => r.id)).toContain(placed.value.id);
    }

    const detail = await getOrderDetail(placed.value.id);
    expect(detail?.order.reference).toBe(placed.value.reference);
    expect(detail?.timeline[0]).toMatchObject({ type: "created" });
    expect(detail?.money).toMatchObject({ collectedTZS: 0, split: false });
    expect(await getOrderDetail("no-such-order")).toBeNull();
  });

  it("counts every status for the chips, whatever status is selected", async () => {
    const all = await searchOrders({});
    const pendingOnly = await searchOrders({ status: "pending" });
    expect(pendingOnly.statusCounts).toEqual(all.statusCounts);
    expect(pendingOnly.rows.every((r) => r.status === "pending")).toBe(true);
  });
});

describe("suspending a partner", () => {
  async function partner() {
    const prisma = getPrisma();
    const application = await prisma.partnerApplication.create({
      data: { kind: "brand", uid: `uid-${Date.now()}`, email: "shop@example.test", businessName: "Shop", contactName: "Neema", phone: "+255754000111", city: "Arusha", status: "approved" },
    });
    return prisma.partner.create({
      data: { kind: "brand", displayName: "Shop", contactName: "Neema", phone: "+255754000111", city: "Arusha", applicationId: application.id, approvedBy: "admin-1" },
    });
  }

  it("needs a reason, records who and why, and can be undone", async () => {
    const p = await partner();
    await expect(setPartnerStatus(p.id, "suspended", "  ", "admin-1")).resolves.toEqual({ ok: false, reason: "note-required" });
    await expect(setPartnerStatus(p.id, "suspended", "Selling fakes", "admin-1")).resolves.toEqual({ ok: true });
    await expect(setPartnerStatus(p.id, "suspended", "Again", "admin-1")).resolves.toEqual({ ok: false, reason: "no-change" });

    const row = await getPrisma().partner.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: "suspended", statusChangedBy: "admin-1", statusNote: "Selling fakes" });

    await expect(setPartnerStatus(p.id, "active", "", "admin-1")).resolves.toEqual({ ok: true });
    await expect(setPartnerStatus("nope", "active", "", "admin-1")).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});
