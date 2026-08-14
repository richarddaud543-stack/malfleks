import { describe, it, expect } from "vitest";
import { branches, getAgentsForCity } from "@/data";
import {
  defaultLocatorFilters,
  filterBranches,
  filtersFromParams,
  getBrandOptions,
  getLocatorBranches,
  getLocatorCities,
  paramsFromFilters,
  toggleBrand,
  type LocatorFilters,
} from "./locator";

function withFilters(patch: Partial<LocatorFilters>): LocatorFilters {
  return { ...defaultLocatorFilters, ...patch };
}

describe("getLocatorBranches", () => {
  it("joins every branch to its brand", () => {
    const entries = getLocatorBranches();
    expect(entries.length).toBe(branches.length);
    for (const { branch, brand } of entries) {
      expect(brand.id).toBe(branch.brandId);
    }
  });

  it("gives every branch a coordinate to plot", () => {
    for (const { branch } of getLocatorBranches()) {
      expect(branch.coords).toBeDefined();
    }
  });
});

describe("filterBranches", () => {
  it("returns every branch when nothing is selected", () => {
    expect(filterBranches(defaultLocatorFilters).length).toBe(branches.length);
  });

  it("narrows to a single city across all brands", () => {
    const results = filterBranches(withFilters({ city: "Mwanza" }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.branch.city === "Mwanza")).toBe(true);
    // The point of the locator: one city, more than one brand.
    expect(new Set(results.map((e) => e.brand.id)).size).toBeGreaterThan(1);
  });

  it("treats several brands as OR", () => {
    const results = filterBranches(withFilters({ brandIds: ["bmw", "ford"] }));
    expect(new Set(results.map((e) => e.brand.id))).toEqual(
      new Set(["bmw", "ford"])
    );
  });

  it("treats city and brand as AND", () => {
    const results = filterBranches(
      withFilters({ city: "Arusha", brandIds: ["toyota"] })
    );
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((e) => e.branch.city === "Arusha" && e.brand.id === "toyota")
    ).toBe(true);
  });

  it("returns nothing for a brand with no branch in that city", () => {
    // Toyota has no Dodoma branch.
    expect(
      filterBranches(withFilters({ city: "Dodoma", brandIds: ["toyota"] }))
    ).toEqual([]);
  });
});

describe("getLocatorCities", () => {
  it("covers the four cities and accounts for every branch", () => {
    const cities = getLocatorCities();
    expect(cities.map((c) => c.name).sort()).toEqual([
      "Arusha",
      "Dar es Salaam",
      "Dodoma",
      "Mwanza",
    ]);
    const total = cities.reduce((sum, c) => sum + c.branchCount, 0);
    expect(total).toBe(branches.length);
  });

  it("orders cities from north to south", () => {
    const lats = getLocatorCities().map((c) => c.center.lat);
    expect(lats).toEqual([...lats].sort((a, b) => b - a));
  });

  it("recounts markers against the selected brands", () => {
    const cities = getLocatorCities(["toyota"]);
    const byName = Object.fromEntries(cities.map((c) => [c.name, c]));
    expect(byName["Dar es Salaam"].branchCount).toBe(1);
    // Kept at zero rather than dropped, so the map shape never changes.
    expect(byName["Dodoma"].branchCount).toBe(0);
    expect(cities.length).toBe(4);
  });

  it("carries the agents that serve each city, including out-of-town ones", () => {
    const arusha = getLocatorCities().find((c) => c.name === "Arusha")!;
    expect(arusha.agents).toEqual(getAgentsForCity("Arusha"));
    // Fargo is based in Dar but covers Arusha through regionsServed.
    expect(arusha.agents.some((a) => a.id === "fargo-courier")).toBe(true);
  });
});

describe("getBrandOptions", () => {
  it("counts every branch of a brand when no city is chosen", () => {
    const total = getBrandOptions(null).reduce((sum, o) => sum + o.count, 0);
    expect(total).toBe(branches.length);
  });

  it("keeps a brand listed at zero in a city it does not serve", () => {
    const toyota = getBrandOptions("Dodoma").find(
      (o) => o.brand.id === "toyota"
    );
    expect(toyota?.count).toBe(0);
  });
});

describe("toggleBrand", () => {
  it("adds then removes a brand", () => {
    expect(toggleBrand([], "bmw")).toEqual(["bmw"]);
    expect(toggleBrand(["bmw", "ford"], "bmw")).toEqual(["ford"]);
  });
});

describe("filtersFromParams / paramsFromFilters", () => {
  it("round-trips a city and brand selection", () => {
    const filters = { city: "Mwanza", brandIds: ["bmw", "halotel"] };
    expect(filtersFromParams(paramsFromFilters(filters))).toEqual(filters);
  });

  it("serialises untouched filters to an empty query", () => {
    expect(paramsFromFilters(defaultLocatorFilters).toString()).toBe("");
  });

  it("drops a city that no branch is in rather than showing an empty page", () => {
    expect(filtersFromParams(new URLSearchParams("city=Atlantis")).city).toBe(
      null
    );
  });

  it("drops an unknown brand id", () => {
    expect(
      filtersFromParams(new URLSearchParams("brand=bmw&brand=nokia")).brandIds
    ).toEqual(["bmw"]);
  });
});
