import { describe, it, expect } from "vitest";
import {
  activeFilterCount,
  defaultFilters,
  getListings,
  isDefaultFilters,
  parseQuery,
  priceBands,
  scoreListing,
  searchProducts,
  type Listing,
  type SearchFilters,
} from "./search";

function withFilters(patch: Partial<SearchFilters>): SearchFilters {
  return { ...defaultFilters, ...patch };
}

function find(productId: string): Listing {
  const listing = getListings().find((l) => l.product.id === productId);
  if (!listing) throw new Error(`no listing for ${productId}`);
  return listing;
}

describe("getListings", () => {
  it("joins every product to an existing brand and branch", () => {
    const listings = getListings();
    expect(listings.length).toBeGreaterThan(0);
    for (const { product, brand, branch } of listings) {
      expect(brand.id).toBe(product.brandId);
      expect(branch.id).toBe(product.branchId);
    }
  });
});

describe("parseQuery", () => {
  it("splits on whitespace and lowercases", () => {
    expect(parseQuery("  BMW   Dar ")).toEqual(["bmw", "dar"]);
  });

  it("returns no terms for an empty or blank query", () => {
    expect(parseQuery("")).toEqual([]);
    expect(parseQuery("   ")).toEqual([]);
  });
});

describe("scoreListing", () => {
  const corolla = find("toyota-corolla");

  it("scores a product-name hit above a description-only hit", () => {
    const nameHit = scoreListing(corolla, parseQuery("corolla"));
    const descriptionHit = scoreListing(corolla, parseQuery("fuel-efficient"));
    expect(nameHit).toBeGreaterThan(descriptionHit);
    expect(descriptionHit).toBeGreaterThan(0);
  });

  it("matches on brand, category and city as well as name", () => {
    expect(scoreListing(corolla, parseQuery("toyota"))).toBeGreaterThan(0);
    expect(scoreListing(corolla, parseQuery("sedan"))).toBeGreaterThan(0);
    expect(scoreListing(corolla, parseQuery("dar"))).toBeGreaterThan(0);
  });

  it("requires every term to match (AND, not OR)", () => {
    expect(scoreListing(corolla, parseQuery("toyota sedan"))).toBeGreaterThan(0);
    expect(scoreListing(corolla, parseQuery("toyota mwanza"))).toBe(0);
  });

  it("scores nothing when there are no terms", () => {
    expect(scoreListing(corolla, [])).toBe(0);
  });
});

describe("searchProducts", () => {
  it("returns the whole catalogue when nothing is set", () => {
    const { listings } = searchProducts(defaultFilters);
    expect(listings.length).toBe(getListings().length);
  });

  it("orders relevance hits by score, best first", () => {
    const { listings } = searchProducts(withFilters({ q: "corolla" }));
    expect(listings[0].product.name).toContain("Corolla");
  });

  it("filters by brand", () => {
    const { listings } = searchProducts(withFilters({ brandIds: ["bmw"] }));
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((l) => l.brand.id === "bmw")).toBe(true);
  });

  it("treats multiple values in one facet as OR", () => {
    const { listings } = searchProducts(
      withFilters({ brandIds: ["bmw", "ford"] })
    );
    expect(new Set(listings.map((l) => l.brand.id))).toEqual(
      new Set(["bmw", "ford"])
    );
  });

  it("treats different facets as AND", () => {
    const { listings } = searchProducts(
      withFilters({ brandIds: ["toyota"], cities: ["Arusha"] })
    );
    expect(listings.length).toBeGreaterThan(0);
    expect(
      listings.every((l) => l.brand.id === "toyota" && l.branch.city === "Arusha")
    ).toBe(true);
  });

  it("filters to branches that run their own delivery", () => {
    const { listings } = searchProducts(withFilters({ deliveryOnly: true }));
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((l) => l.branch.deliveryOffered)).toBe(true);
  });

  it("filters out-of-stock products", () => {
    const all = searchProducts(defaultFilters).listings;
    const inStock = searchProducts(withFilters({ inStockOnly: true })).listings;
    expect(inStock.every((l) => l.product.inStock)).toBe(true);
    expect(inStock.length).toBeLessThan(all.length);
  });

  it("keeps prices inside the selected band", () => {
    const band = priceBands.find((b) => b.id === "1m-10m")!;
    const { listings } = searchProducts(withFilters({ priceBand: band.id }));
    expect(listings.length).toBeGreaterThan(0);
    expect(
      listings.every(
        (l) => l.product.priceTZS >= band.min && l.product.priceTZS < band.max
      )
    ).toBe(true);
  });

  it("ignores an unknown price band rather than matching nothing", () => {
    const { listings } = searchProducts(withFilters({ priceBand: "bogus" }));
    expect(listings.length).toBe(getListings().length);
  });

  it("sorts by price in both directions", () => {
    const asc = searchProducts(withFilters({ sort: "price-asc" })).listings;
    const desc = searchProducts(withFilters({ sort: "price-desc" })).listings;
    expect(asc[0].product.priceTZS).toBeLessThan(
      asc[asc.length - 1].product.priceTZS
    );
    expect(desc[0].product.priceTZS).toBe(
      asc[asc.length - 1].product.priceTZS
    );
  });

  it("sorts by name", () => {
    const { listings } = searchProducts(withFilters({ sort: "name" }));
    const names = listings.map((l) => l.product.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("returns nothing for a query that matches no product", () => {
    const { listings } = searchProducts(
      withFilters({ q: "zzz-not-a-real-product" })
    );
    expect(listings).toEqual([]);
  });

  describe("facet counts", () => {
    it("counts every brand when no filter is applied", () => {
      const { facets } = searchProducts(defaultFilters);
      const total = facets.brands.reduce((sum, b) => sum + b.count, 0);
      expect(total).toBe(getListings().length);
    });

    it("does not let a brand selection zero out its sibling brands", () => {
      const { facets } = searchProducts(withFilters({ brandIds: ["bmw"] }));
      const ford = facets.brands.find((b) => b.value === "ford");
      expect(ford?.count).toBeGreaterThan(0);
    });

    it("narrows other dimensions to the current selection", () => {
      const { facets, listings } = searchProducts(
        withFilters({ brandIds: ["bmw"] })
      );
      const cityTotal = facets.cities.reduce((sum, c) => sum + c.count, 0);
      expect(cityTotal).toBe(listings.length);
    });

    it("reports zero for facet values excluded by the text query", () => {
      const { facets } = searchProducts(withFilters({ q: "corolla" }));
      const bmw = facets.brands.find((b) => b.value === "bmw");
      expect(bmw?.count).toBe(0);
    });
  });
});

describe("isDefaultFilters / activeFilterCount", () => {
  it("recognises untouched filters", () => {
    expect(isDefaultFilters(defaultFilters)).toBe(true);
    expect(activeFilterCount(defaultFilters)).toBe(0);
  });

  it("ignores sort order, which is not a filter", () => {
    expect(isDefaultFilters(withFilters({ sort: "price-asc" }))).toBe(true);
    expect(activeFilterCount(withFilters({ sort: "price-asc" }))).toBe(0);
  });

  it("counts each selected value", () => {
    const filters = withFilters({
      brandIds: ["bmw", "ford"],
      cities: ["Arusha"],
      deliveryOnly: true,
    });
    expect(isDefaultFilters(filters)).toBe(false);
    expect(activeFilterCount(filters)).toBe(4);
  });
});
