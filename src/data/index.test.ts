import { describe, it, expect } from "vitest";
import {
  getBrandBySlug,
  getBrandById,
  getBranchesByBrandId,
  getBranchById,
  getProductsByBranchId,
  getProductById,
  getAgentsForCity,
} from "./index";

describe("getBrandBySlug / getBrandById", () => {
  it("finds a brand by slug", () => {
    expect(getBrandBySlug("toyota")?.name).toBe("Toyota");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getBrandBySlug("not-a-real-brand")).toBeUndefined();
  });

  it("finds a brand by id", () => {
    expect(getBrandById("halotel")?.category).toBe("telecom");
  });
});

describe("getBranchesByBrandId", () => {
  it("returns only branches belonging to that brand", () => {
    const branches = getBranchesByBrandId("toyota");
    expect(branches.length).toBeGreaterThan(0);
    expect(branches.every((b) => b.brandId === "toyota")).toBe(true);
  });

  it("returns an empty array for a brand with no branches", () => {
    expect(getBranchesByBrandId("not-a-real-brand")).toEqual([]);
  });
});

describe("getBranchById / getProductsByBranchId / getProductById", () => {
  it("resolves a known branch and its products", () => {
    const branch = getBranchById("toyota-dar");
    expect(branch?.deliveryOffered).toBe(true);

    const products = getProductsByBranchId("toyota-dar");
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.branchId === "toyota-dar")).toBe(true);
  });

  it("finds a product by id", () => {
    expect(getProductById("toyota-corolla")?.name).toBe("Toyota Corolla");
  });
});

describe("getAgentsForCity — the core delivery-routing lookup", () => {
  it("matches agents whose home city equals the branch city", () => {
    const agents = getAgentsForCity("Dodoma");
    expect(agents.some((a) => a.name === "Dodoma Trusted Delivery")).toBe(true);
  });

  it("also matches agents whose regionsServed includes the branch city, even if based elsewhere", () => {
    const agents = getAgentsForCity("Arusha");
    // Fargo Courier is based in Dar es Salaam but serves Arusha via regionsServed.
    expect(agents.some((a) => a.name === "Fargo Courier")).toBe(true);
    expect(agents.some((a) => a.name === "Arusha Swift Couriers")).toBe(true);
  });

  it("returns an empty array for a city no agent serves", () => {
    expect(getAgentsForCity("Nowhereville")).toEqual([]);
  });
});
