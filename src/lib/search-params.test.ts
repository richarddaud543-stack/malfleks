import { describe, it, expect } from "vitest";
import { defaultFilters, type SearchFilters } from "./search";
import {
  filtersFromParams,
  paramsFromFilters,
  searchHref,
  toggleValue,
} from "./search-params";

function withFilters(patch: Partial<SearchFilters>): SearchFilters {
  return { ...defaultFilters, ...patch };
}

describe("filtersFromParams", () => {
  it("returns the defaults for an empty query string", () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(defaultFilters);
  });

  it("reads repeated params as multi-value facets", () => {
    const filters = filtersFromParams(
      new URLSearchParams("brand=bmw&brand=ford&city=Arusha")
    );
    expect(filters.brandIds).toEqual(["bmw", "ford"]);
    expect(filters.cities).toEqual(["Arusha"]);
  });

  it("reads the boolean toggles", () => {
    const filters = filtersFromParams(new URLSearchParams("delivery=1&stock=1"));
    expect(filters.deliveryOnly).toBe(true);
    expect(filters.inStockOnly).toBe(true);
  });

  it("drops an unknown price band", () => {
    expect(filtersFromParams(new URLSearchParams("price=bogus")).priceBand).toBe(
      null
    );
    expect(
      filtersFromParams(new URLSearchParams("price=1m-10m")).priceBand
    ).toBe("1m-10m");
  });

  it("falls back to the default sort for an unknown sort key", () => {
    expect(filtersFromParams(new URLSearchParams("sort=sideways")).sort).toBe(
      defaultFilters.sort
    );
    expect(filtersFromParams(new URLSearchParams("sort=price-asc")).sort).toBe(
      "price-asc"
    );
  });
});

describe("paramsFromFilters", () => {
  it("serialises nothing when filters are untouched", () => {
    expect(paramsFromFilters(defaultFilters).toString()).toBe("");
  });

  it("omits a whitespace-only query", () => {
    expect(paramsFromFilters(withFilters({ q: "   " })).toString()).toBe("");
  });

  it("round-trips every filter dimension", () => {
    const filters = withFilters({
      q: "bmw suv",
      brandIds: ["bmw", "ford"],
      categories: ["SUV"],
      cities: ["Dar es Salaam"],
      priceBand: "over-100m",
      deliveryOnly: true,
      inStockOnly: true,
      sort: "price-desc",
    });
    expect(filtersFromParams(paramsFromFilters(filters))).toEqual(filters);
  });

  it("round-trips values containing spaces", () => {
    const filters = withFilters({ cities: ["Dar es Salaam"] });
    expect(filtersFromParams(paramsFromFilters(filters)).cities).toEqual([
      "Dar es Salaam",
    ]);
  });
});

describe("searchHref", () => {
  it("stays clean when nothing is set", () => {
    expect(searchHref(defaultFilters)).toBe("/search");
  });

  it("appends a query string when something is set", () => {
    expect(searchHref(withFilters({ q: "hilux" }))).toBe("/search?q=hilux");
  });
});

describe("toggleValue", () => {
  it("adds a value that is not selected", () => {
    expect(toggleValue(["bmw"], "ford")).toEqual(["bmw", "ford"]);
  });

  it("removes a value that is already selected", () => {
    expect(toggleValue(["bmw", "ford"], "bmw")).toEqual(["ford"]);
  });
});
