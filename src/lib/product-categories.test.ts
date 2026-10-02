import { describe, expect, it } from "vitest";

import { products } from "@/data";
import {
  CATEGORY_SPEC_SUGGESTIONS,
  PRODUCT_CATEGORIES,
  canonicalCategory,
  normalizeCategory,
  specSuggestionsFor,
} from "./product-categories";
import { MAX_SPECS } from "./product-listing";

describe("PRODUCT_CATEGORIES", () => {
  it("includes every category the seeded catalogue already uses, spelled the same", () => {
    // A new listing has to land in the same search facet as the products
    // already on the shop — so the seed's spelling is the canonical one.
    for (const category of new Set(products.map((p) => p.category))) {
      expect(PRODUCT_CATEGORIES as readonly string[]).toContain(category);
    }
  });

  it("includes the general-marketplace categories", () => {
    for (const category of [
      "Phones",
      "TVs & Audio",
      "Home appliances",
      "Cars",
      "Motorcycles",
      "Fashion",
      "Shoes",
      "Beauty",
      "Furniture",
      "Food & Groceries",
      "Tools",
      "Other",
    ]) {
      expect(PRODUCT_CATEGORIES as readonly string[]).toContain(category);
    }
  });

  it("has no two entries that differ only by case or spacing", () => {
    const folded = PRODUCT_CATEGORIES.map((c) => c.toLowerCase().replace(/\s+/g, " "));
    expect(new Set(folded).size).toBe(folded.length);
  });
});

describe("normalizeCategory", () => {
  it("maps case and whitespace variants onto the canonical spelling", () => {
    expect(normalizeCategory("phones ")).toBe("Phones");
    expect(normalizeCategory("  PHONES")).toBe("Phones");
    expect(normalizeCategory("home    appliances")).toBe("Home appliances");
    expect(normalizeCategory("sim card")).toBe("SIM Card");
    expect(normalizeCategory("tvs & audio")).toBe("TVs & Audio");
  });

  it("folds an obvious plural onto the category the catalogue already has", () => {
    // "Laptop" is what the shop says today; "Laptops" must not open a second
    // facet one letter away from it.
    expect(normalizeCategory("Laptops")).toBe("Laptop");
    expect(normalizeCategory("power banks")).toBe("Power Bank");
  });

  it("leaves an unknown category as typed, trimmed and single-spaced", () => {
    expect(normalizeCategory("  Solar   Panels ")).toBe("Solar Panels");
    expect(normalizeCategory("Vitenge")).toBe("Vitenge");
  });

  it("returns an empty string for a blank input, so the caller can call it missing", () => {
    expect(normalizeCategory("   ")).toBe("");
  });

  it("is idempotent", () => {
    for (const value of ["phones ", "Solar   Panels", "LAPTOPS", "Other"]) {
      const once = normalizeCategory(value);
      expect(normalizeCategory(once)).toBe(once);
    }
  });
});

describe("canonicalCategory", () => {
  it("is null for a category we do not know", () => {
    expect(canonicalCategory("Solar Panels")).toBeNull();
    expect(canonicalCategory("")).toBeNull();
  });
});

describe("specSuggestionsFor", () => {
  it("offers the details buyers ask about for phones and for cars", () => {
    expect(specSuggestionsFor("Phones")).toEqual(["Storage", "RAM", "Colour", "Condition", "Warranty"]);
    expect(specSuggestionsFor("Cars")).toEqual([
      "Year",
      "Mileage",
      "Engine",
      "Transmission",
      "Fuel",
      "Colour",
    ]);
  });

  it("works from a variant spelling, since that is what is in the box while typing", () => {
    expect(specSuggestionsFor(" phones")).toEqual(specSuggestionsFor("Phones"));
  });

  it("offers nothing for an unknown category or for Other", () => {
    expect(specSuggestionsFor("Solar Panels")).toEqual([]);
    expect(specSuggestionsFor("Other")).toEqual([]);
    expect(specSuggestionsFor("")).toEqual([]);
  });

  it("only has lists for real categories, each within the detail limit and free of repeats", () => {
    for (const [category, labels] of Object.entries(CATEGORY_SPEC_SUGGESTIONS)) {
      expect(PRODUCT_CATEGORIES as readonly string[]).toContain(category);
      expect(labels!.length).toBeGreaterThan(0);
      expect(labels!.length).toBeLessThanOrEqual(MAX_SPECS);
      expect(new Set(labels).size).toBe(labels!.length);
    }
  });
});
