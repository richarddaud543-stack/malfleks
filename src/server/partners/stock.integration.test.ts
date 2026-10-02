// @vitest-environment node
//
// Real Postgres. A partner may flip stock on their own branch's live products
// and on nothing else; these prove the "nothing else".

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { listLiveProductsForBranch, setStockAsPartner } from "./stock";
import { createTestPartner } from "./test-fixtures";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("partner-stock");
  await seedDatabase(getPrisma());
  await createTestPartner({ uid: "uid-dar", email: "dar@example.test", branchId: "toyota-dar" });
  await createTestPartner({ uid: "uid-arusha", email: "arusha@example.test", branchId: "toyota-arusha" });
  await createTestPartner({ uid: "uid-off", email: "off@example.test", branchId: "toyota-mwanza", status: "suspended" });
  await createTestPartner({ uid: "uid-courier", email: "c@example.test", kind: "courier", agentId: "arusha-swift-couriers" });
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const stockOf = async (id: string) => (await getPrisma().product.findUniqueOrThrow({ where: { id }, select: { inStock: true } })).inStock;

describe("setStockAsPartner", () => {
  it("lets the branch's own partner mark a product out of stock and back", async () => {
    await expect(setStockAsPartner("uid-dar", "toyota-corolla", false)).resolves.toEqual({ ok: true, inStock: false });
    expect(await stockOf("toyota-corolla")).toBe(false);
    await expect(setStockAsPartner("uid-dar", "toyota-corolla", true)).resolves.toEqual({ ok: true, inStock: true });
    expect(await stockOf("toyota-corolla")).toBe(true);
  });

  it("refuses another branch's partner, a courier, a suspended partner and a stranger", async () => {
    await expect(setStockAsPartner("uid-arusha", "toyota-corolla", false)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(setStockAsPartner("uid-courier", "toyota-corolla", false)).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(setStockAsPartner("uid-off", "toyota-corolla", false)).resolves.toEqual({ ok: false, reason: "partner-suspended" });
    await expect(setStockAsPartner("uid-nobody", "toyota-corolla", false)).resolves.toEqual({ ok: false, reason: "not-a-partner" });
    expect(await stockOf("toyota-corolla")).toBe(true);
  });

  it("cannot touch a product an admin has hidden, and never un-hides one", async () => {
    await getPrisma().product.update({ where: { id: "toyota-prado" }, data: { hiddenAt: new Date() } });

    await expect(setStockAsPartner("uid-dar", "toyota-prado", false)).resolves.toEqual({ ok: false, reason: "not-found" });
    const row = await getPrisma().product.findUniqueOrThrow({ where: { id: "toyota-prado" }, select: { inStock: true, hiddenAt: true } });
    expect(row.inStock).toBe(true);
    expect(row.hiddenAt).not.toBeNull();

    const listed = await listLiveProductsForBranch("toyota-dar");
    expect(listed.map((p) => p.id)).not.toContain("toyota-prado");
    expect(listed.map((p) => p.id)).toContain("toyota-corolla");
  });
});
