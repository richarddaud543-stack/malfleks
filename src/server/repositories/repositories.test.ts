// @vitest-environment node
//
// These tests run against a real SQLite database built from the committed
// migration and populated by the real seed script. Nothing is mocked: the point
// is to prove the DB-backed accessors are interchangeable with the static ones,
// and a mocked Prisma would only prove the mock returns what it was told to.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as staticData from "@/data";
import { getPrisma, resetPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import * as repo from "@/server/repositories";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const PRISMA_CLI = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");

let workDir: string;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "soko-repo-test-"));
  const databaseUrl = `file:${path.join(workDir, "test.db").replaceAll("\\", "/")}`;

  // Set before the first query so the lazily-built client binds to this file
  // and not to the developer's dev.db.
  process.env.DATABASE_URL = databaseUrl;
  await resetPrisma();

  if (!existsSync(PRISMA_CLI)) {
    throw new Error(
      `Prisma CLI not found at ${PRISMA_CLI}. Run "npm install" before the test suite.`
    );
  }

  // Applying the committed migrations, rather than `db push` from the schema,
  // means a migration that drifts from the schema fails here instead of in prod.
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await resetPrisma();
  rmSync(workDir, { recursive: true, force: true });
});

describe("brand accessors", () => {
  it("getAllBrands matches the static data, in the same order", async () => {
    await expect(repo.getAllBrands()).resolves.toEqual(staticData.getAllBrands());
  });

  it("getBrandBySlug matches for every known slug", async () => {
    for (const brand of staticData.brands) {
      await expect(repo.getBrandBySlug(brand.slug)).resolves.toEqual(
        staticData.getBrandBySlug(brand.slug)
      );
    }
  });

  it("getBrandById matches for every known id", async () => {
    for (const brand of staticData.brands) {
      await expect(repo.getBrandById(brand.id)).resolves.toEqual(
        staticData.getBrandById(brand.id)
      );
    }
  });

  it("returns undefined for unknown brands, like the static accessors", async () => {
    await expect(repo.getBrandBySlug("no-such-brand")).resolves.toBeUndefined();
    await expect(repo.getBrandById("no-such-brand")).resolves.toBeUndefined();
  });
});

describe("branch accessors", () => {
  it("getBranchesByBrandId matches for every brand", async () => {
    for (const brand of staticData.brands) {
      await expect(repo.getBranchesByBrandId(brand.id)).resolves.toEqual(
        staticData.getBranchesByBrandId(brand.id)
      );
    }
  });

  it("getBranchById matches for every branch", async () => {
    for (const branch of staticData.branches) {
      await expect(repo.getBranchById(branch.id)).resolves.toEqual(
        staticData.getBranchById(branch.id)
      );
    }
  });

  it("returns an empty array for a brand with no branches", async () => {
    await expect(repo.getBranchesByBrandId("no-such-brand")).resolves.toEqual([]);
  });

  it("preserves verified and deliveryOffered per branch", async () => {
    // These two flags drive the trust badge and the delivery-routing decision,
    // so a blanket true/false would still pass a shallow count assertion.
    const rows = await repo.getAllBranches();
    for (const branch of staticData.branches) {
      const row = rows.find((b) => b.id === branch.id);
      expect(row?.verified).toBe(branch.verified);
      expect(row?.deliveryOffered).toBe(branch.deliveryOffered);
    }
  });

  it("leaves an absent phone number undefined rather than null", async () => {
    const withoutPhone = staticData.branches.find((b) => b.phone === undefined);
    expect(withoutPhone).toBeDefined();
    const row = await repo.getBranchById(withoutPhone!.id);
    expect(row?.phone).toBeUndefined();
  });
});

describe("product accessors", () => {
  it("getProductsByBranchId matches for every branch", async () => {
    for (const branch of staticData.branches) {
      await expect(repo.getProductsByBranchId(branch.id)).resolves.toEqual(
        staticData.getProductsByBranchId(branch.id)
      );
    }
  });

  it("getProductById matches for every product", async () => {
    for (const product of staticData.products) {
      await expect(repo.getProductById(product.id)).resolves.toEqual(
        staticData.getProductById(product.id)
      );
    }
  });

  it("round-trips priceTZS as an exact integer", async () => {
    for (const product of staticData.products) {
      const row = await repo.getProductById(product.id);
      expect(Number.isInteger(row!.priceTZS)).toBe(true);
      expect(row!.priceTZS).toBe(product.priceTZS);
    }
  });

  it("preserves spec keys, values and their declared order", async () => {
    // Specs are stored as rows, so key order only survives if the `position`
    // column is written and read back correctly.
    for (const product of staticData.products) {
      if (!product.specs) continue;
      const row = await repo.getProductById(product.id);
      expect(Object.keys(row!.specs!)).toEqual(Object.keys(product.specs));
      expect(row!.specs).toEqual(product.specs);
    }
  });

  it("returns undefined for an unknown product", async () => {
    await expect(repo.getProductById("no-such-product")).resolves.toBeUndefined();
  });
});

describe("getAgentsForCity", () => {
  const cities = [
    ...new Set([
      ...staticData.branches.map((b) => b.city),
      ...staticData.deliveryAgents.map((a) => a.city),
      ...staticData.deliveryAgents.flatMap((a) => a.regionsServed),
    ]),
  ];

  it("matches the static implementation for every city in the dataset", async () => {
    for (const city of cities) {
      await expect(repo.getAgentsForCity(city)).resolves.toEqual(
        staticData.getAgentsForCity(city)
      );
    }
  });

  it("includes an agent whose home city differs but which serves the region", async () => {
    // Fargo is based in Dar es Salaam; a Dodoma order must still reach it.
    const agents = await repo.getAgentsForCity("Dodoma");
    const ids = agents.map((a) => a.id);
    expect(ids).toContain("fargo-courier");
    expect(agents.find((a) => a.id === "fargo-courier")?.city).toBe("Dar es Salaam");
  });

  it("excludes an agent that neither lives in nor serves the city", async () => {
    const ids = (await repo.getAgentsForCity("Dodoma")).map((a) => a.id);
    expect(ids).not.toContain("mwanza-express-riders");
  });

  it("returns an empty array for an unserved city", async () => {
    await expect(repo.getAgentsForCity("Mbeya")).resolves.toEqual([]);
    expect(staticData.getAgentsForCity("Mbeya")).toEqual([]);
  });

  it("matches case-sensitively, exactly as the static filter does", async () => {
    await expect(repo.getAgentsForCity("dodoma")).resolves.toEqual(
      staticData.getAgentsForCity("dodoma")
    );
    await expect(repo.getAgentsForCity("dodoma")).resolves.toEqual([]);
  });
});

describe("seeding", () => {
  it("is idempotent — a second run changes no row counts or results", async () => {
    const prisma = getPrisma();
    const before = await tableCounts();
    const brandsBefore = await repo.getAllBrands();
    const productsBefore = await repo.getAllProducts();

    await seedDatabase(prisma);

    expect(await tableCounts()).toEqual(before);
    await expect(repo.getAllBrands()).resolves.toEqual(brandsBefore);
    await expect(repo.getAllProducts()).resolves.toEqual(productsBefore);
  }, 120_000);

  it("stores exactly the static record counts", async () => {
    expect(await tableCounts()).toEqual({
      brands: staticData.brands.length,
      branches: staticData.branches.length,
      products: staticData.products.length,
      deliveryAgents: staticData.deliveryAgents.length,
      productSpecs: staticData.products.reduce(
        (total, p) => total + Object.keys(p.specs ?? {}).length,
        0
      ),
      agentRegions: staticData.deliveryAgents.reduce(
        (total, a) => total + a.regionsServed.length,
        0
      ),
    });
  });
});

async function tableCounts() {
  const prisma = getPrisma();
  return {
    brands: await prisma.brand.count(),
    branches: await prisma.branch.count(),
    products: await prisma.product.count(),
    deliveryAgents: await prisma.deliveryAgent.count(),
    productSpecs: await prisma.productSpec.count(),
    agentRegions: await prisma.agentRegion.count(),
  };
}
