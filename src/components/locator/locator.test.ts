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
import { staticLocatorData } from "./locator.fixture";

// The same catalogue these assertions were written against, now passed in
// explicitly rather than read from module scope.
const data = staticLocatorData();

function withFilters(patch: Partial<LocatorFilters>): LocatorFilters {
  return { ...defaultLocatorFilters, ...patch };
}

describe("getLocatorBranches", () => {
  it("joins every branch to its brand", () => {
    const entries = getLocatorBranches(data);
    expect(entries.length).toBe(branches.length);
    for (const { branch, brand } of entries) {
      expect(brand.id).toBe(branch.brandId);
    }
  });

  it("gives every branch a coordinate to plot", () => {
    for (const { branch } of getLocatorBranches(data)) {
      expect(branch.coords).toBeDefined();
    }
  });
});

describe("filterBranches", () => {
  it("returns every branch when nothing is selected", () => {
    expect(filterBranches(data, defaultLocatorFilters).length).toBe(branches.length);
  });

  it("narrows to a single city across all brands", () => {
    const results = filterBranches(data, withFilters({ city: "Mwanza" }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.branch.city === "Mwanza")).toBe(true);
    // The point of the locator: one city, more than one brand.
    expect(new Set(results.map((e) => e.brand.id)).size).toBeGreaterThan(1);
  });

  it("treats several brands as OR", () => {
    const results = filterBranches(data, withFilters({ brandIds: ["bmw", "ford"] }));
    expect(new Set(results.map((e) => e.brand.id))).toEqual(
      new Set(["bmw", "ford"])
    );
  });

  it("treats city and brand as AND", () => {
    const results = filterBranches(data, 
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
      filterBranches(data, withFilters({ city: "Dodoma", brandIds: ["toyota"] }))
    ).toEqual([]);
  });

  it("matches a free-text query against the branch name", () => {
    // "Kariakoo" only appears in one branch's own name, not any brand or city.
    const results = filterBranches(data, withFilters({ q: "Kariakoo" }));
    expect(results.map((e) => e.branch.id)).toEqual(["oraimo-dar"]);
  });

  it("matches a free-text query against the brand name, case-insensitively", () => {
    const results = filterBranches(data, withFilters({ q: "TOYOTA" }));
    expect(results.length).toBe(3);
    expect(results.every((e) => e.brand.id === "toyota")).toBe(true);
  });

  it("matches a free-text query against the city", () => {
    const results = filterBranches(data, withFilters({ q: "dodoma" }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.branch.city === "Dodoma")).toBe(true);
  });

  it("treats the query as AND with city and brand", () => {
    const results = filterBranches(data, 
      withFilters({ city: "Dar es Salaam", brandIds: ["halotel"], q: "shop" })
    );
    expect(results.map((e) => e.branch.id)).toEqual(["halotel-dar"]);

    expect(
      filterBranches(data, 
        withFilters({ city: "Dar es Salaam", brandIds: ["halotel"], q: "arusha" })
      )
    ).toEqual([]);
  });

  it("treats a blank or whitespace-only query as no query at all", () => {
    expect(filterBranches(data, withFilters({ q: "   " })).length).toBe(
      branches.length
    );
  });
});

describe("getLocatorCities", () => {
  it("covers the four cities and accounts for every branch", () => {
    const cities = getLocatorCities(data);
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
    const lats = getLocatorCities(data).map((c) => c.center.lat);
    expect(lats).toEqual([...lats].sort((a, b) => b - a));
  });

  it("recounts markers against the selected brands", () => {
    const cities = getLocatorCities(data, ["toyota"]);
    const byName = Object.fromEntries(cities.map((c) => [c.name, c]));
    expect(byName["Dar es Salaam"].branchCount).toBe(1);
    // Kept at zero rather than dropped, so the map shape never changes.
    expect(byName["Dodoma"].branchCount).toBe(0);
    expect(cities.length).toBe(4);
  });

  it("carries the agents that serve each city, including out-of-town ones", () => {
    const arusha = getLocatorCities(data).find((c) => c.name === "Arusha")!;
    expect(arusha.agents).toEqual(getAgentsForCity("Arusha"));
    // Fargo is based in Dar but covers Arusha through regionsServed.
    expect(arusha.agents.some((a) => a.id === "fargo-courier")).toBe(true);
  });

  it("recounts markers against a free-text search, same as it does for brand", () => {
    const cities = getLocatorCities(data, [], "Kariakoo");
    const byName = Object.fromEntries(cities.map((c) => [c.name, c]));
    expect(byName["Dar es Salaam"].branchCount).toBe(1);
    expect(byName["Mwanza"].branchCount).toBe(0);
    // Every city keeps its marker even at zero, so the map shape holds.
    expect(cities.length).toBe(4);
  });
});

describe("getBrandOptions", () => {
  it("counts every branch of a brand when no city is chosen", () => {
    const total = getBrandOptions(data, null).reduce((sum, o) => sum + o.count, 0);
    expect(total).toBe(branches.length);
  });

  it("keeps a brand listed at zero in a city it does not serve", () => {
    const toyota = getBrandOptions(data, "Dodoma").find(
      (o) => o.brand.id === "toyota"
    );
    expect(toyota?.count).toBe(0);
  });

  it("recounts brand chips against a free-text search", () => {
    const options = getBrandOptions(data, null, "Kariakoo");
    const oraimo = options.find((o) => o.brand.id === "oraimo");
    const toyota = options.find((o) => o.brand.id === "toyota");
    expect(oraimo?.count).toBe(1);
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
  it("round-trips a city, brand and search selection", () => {
    const filters = {
      city: "Mwanza",
      brandIds: ["bmw", "halotel"],
      q: "kenyatta",
    };
    expect(filtersFromParams(data, paramsFromFilters(filters))).toEqual(filters);
  });

  it("serialises untouched filters to an empty query", () => {
    expect(paramsFromFilters(defaultLocatorFilters).toString()).toBe("");
  });

  it("drops a city that no branch is in rather than showing an empty page", () => {
    expect(filtersFromParams(data, new URLSearchParams("city=Atlantis")).city).toBe(
      null
    );
  });

  it("drops an unknown brand id", () => {
    expect(
      filtersFromParams(data, new URLSearchParams("brand=bmw&brand=nokia")).brandIds
    ).toEqual(["bmw"]);
  });

  it("reads a search query from the URL", () => {
    expect(
      filtersFromParams(data, new URLSearchParams("q=kariakoo")).q
    ).toBe("kariakoo");
  });

  it("defaults q to an empty string when absent from the URL", () => {
    expect(filtersFromParams(data, new URLSearchParams("")).q).toBe("");
  });

  it("omits q from the query string when blank, and trims it otherwise", () => {
    expect(paramsFromFilters(defaultLocatorFilters).toString()).not.toContain(
      "q="
    );
    expect(
      paramsFromFilters({ city: null, brandIds: [], q: "  corolla  " }).get(
        "q"
      )
    ).toBe("corolla");
  });
});
