import { describe, it, expect, beforeAll } from "vitest";
import * as staticData from "@/data";
import * as repo from "@/server/repositories";
import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";

/**
 * The guard rail for the static-to-database cutover.
 *
 * Every catalogue page now reads `@/server/repositories` instead of the arrays
 * in `src/data`. That is only safe if the two return the *same records in the
 * same order* — ordering included, because the static accessors return source
 * declaration order and the site's layout depends on it. The repositories sort
 * by the `sortOrder` column the seed writes from each array index; this asserts
 * that mapping actually holds rather than assuming it.
 *
 * It is deliberately a comparison, not a snapshot: a snapshot would have to be
 * regenerated whenever the catalogue changes and would then prove nothing.
 *
 * Once `src/data` stops being the editorial source of truth (Phase 2), this
 * test retires with it — its whole purpose is to make the swap provable.
 */

beforeAll(async () => {
  // The dev database may be stale or empty in a fresh checkout, and this file
  // compares against the arrays, so it seeds from them first.
  await seedDatabase(getPrisma());
});

describe("repository / static-data parity", () => {
  it("returns every brand, in the same order", async () => {
    expect(await repo.getAllBrands()).toEqual(staticData.getAllBrands());
  });

  it("returns every branch, in the same order", async () => {
    expect(await repo.getAllBranches()).toEqual(staticData.branches);
  });

  it("returns every product, in the same order", async () => {
    expect(await repo.getAllProducts()).toEqual(staticData.products);
  });

  it("returns every delivery agent, in the same order", async () => {
    expect(await repo.getAllDeliveryAgents()).toEqual(
      staticData.deliveryAgents
    );
  });

  it("resolves each brand by slug and by id identically", async () => {
    for (const brand of staticData.brands) {
      expect(await repo.getBrandBySlug(brand.slug)).toEqual(
        staticData.getBrandBySlug(brand.slug)
      );
      expect(await repo.getBrandById(brand.id)).toEqual(
        staticData.getBrandById(brand.id)
      );
    }
  });

  it("returns a brand's branches in the same order", async () => {
    for (const brand of staticData.brands) {
      expect(await repo.getBranchesByBrandId(brand.id)).toEqual(
        staticData.getBranchesByBrandId(brand.id)
      );
    }
  });

  it("returns a branch's products in the same order, specs included", async () => {
    for (const branch of staticData.branches) {
      expect(await repo.getProductsByBranchId(branch.id)).toEqual(
        staticData.getProductsByBranchId(branch.id)
      );
    }
  });

  it("resolves each product by id, specs and order preserved", async () => {
    for (const product of staticData.products) {
      expect(await repo.getProductById(product.id)).toEqual(
        staticData.getProductById(product.id)
      );
    }
  });

  it("matches courier coverage for every city with a branch", async () => {
    for (const city of new Set(staticData.branches.map((b) => b.city))) {
      expect(await repo.getAgentsForCity(city)).toEqual(
        staticData.getAgentsForCity(city)
      );
    }
  });

  it("agrees that an unknown id is absent, rather than throwing", async () => {
    expect(await repo.getBrandById("not-a-brand")).toBeUndefined();
    expect(await repo.getProductById("not-a-product")).toBeUndefined();
    expect(await repo.getBranchById("not-a-branch")).toBeUndefined();
  });
});
