import { describe, expect, it } from "vitest";

import {
  MAX_DESCRIPTION,
  MAX_PRICE_TZS,
  MAX_SPECS,
  emptyProductListing,
  validateProductListing,
  type ProductListingInput,
} from "./product-listing";

/**
 * The browser copy of the rules `submitProduct` enforces for real.
 *
 * These tests exist mostly for the price. Everything else on this form is a
 * length check; the price is a string being turned into a Postgres `Int`, and
 * every sloppy way of doing that is represented below by the value it would
 * have let through.
 */

const good: ProductListingInput = {
  name: "Corolla Hybrid 2024",
  category: "Cars",
  description:
    "A one-owner hybrid saloon with full service history, sold from the showroom floor.",
  image: "sedan",
  price: "48,500,000",
  inStock: true,
  specs: [{ key: "Year", value: "2024" }],
};

function errorsFor(patch: Partial<ProductListingInput>) {
  const result = validateProductListing({ ...good, ...patch });
  return result.ok ? {} : result.errors;
}

describe("validateProductListing", () => {
  it("accepts a filled-in listing and hands back parsed values", () => {
    const result = validateProductListing(good);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Thousands separators are the normal way to type a car price here.
    expect(result.value.priceTZS).toBe(48_500_000);
    expect(result.value.name).toBe("Corolla Hybrid 2024");
    expect(result.value.specs).toEqual([{ key: "Year", value: "2024" }]);
  });

  it("rejects the empty form rather than submitting a blank product", () => {
    const result = validateProductListing(emptyProductListing);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "category",
      "description",
      "image",
      "name",
      "price",
    ]);
  });

  describe("the price", () => {
    // `Number("")` is 0, not NaN. That is the trap.
    it("rejects an empty price instead of reading it as zero", () => {
      expect(errorsFor({ price: "" }).price).toBeDefined();
      expect(errorsFor({ price: "   " }).price).toBeDefined();
    });

    it("rejects anything that isn't digits", () => {
      for (const price of ["1.25e6", "0x10", "12.50", "-500", "50k", "TZS 500"]) {
        expect(errorsFor({ price }).price, price).toBeDefined();
      }
    });

    it("rejects zero", () => {
      expect(errorsFor({ price: "0" }).price).toBeDefined();
      expect(errorsFor({ price: "000" }).price).toBeDefined();
    });

    // An extra zero on a car price otherwise overflows the Int column and
    // surfaces as a Prisma error the partner cannot act on.
    it("rejects a price past what the database column holds", () => {
      expect(errorsFor({ price: String(MAX_PRICE_TZS + 1) }).price).toBeDefined();
      expect(errorsFor({ price: String(MAX_PRICE_TZS) }).price).toBeUndefined();
    });

    it("strips separators and whitespace before parsing", () => {
      const result = validateProductListing({ ...good, price: " 1 250 000 " });
      expect(result.ok && result.value.priceTZS).toBe(1_250_000);
    });
  });

  describe("the picture", () => {
    it("rejects a key ProductIcon cannot draw", () => {
      // Without this, `ProductIcon` falls back to `smartphone` and a pickup
      // truck is listed with a phone next to it.
      expect(errorsFor({ image: "tractor" }).image).toBeDefined();
    });

    it("accepts every key the icon set actually draws", () => {
      expect(errorsFor({ image: "pickup" }).image).toBeUndefined();
      expect(errorsFor({ image: "powerbank" }).image).toBeUndefined();
    });
  });

  describe("the details table", () => {
    it("drops blank rows without complaining about them", () => {
      const result = validateProductListing({
        ...good,
        specs: [
          { key: "Year", value: "2024" },
          { key: "", value: "" },
          { key: "  ", value: "  " },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.specs).toEqual([
        { key: "Year", value: "2024" },
      ]);
    });

    it("refuses a half-filled row rather than silently discarding it", () => {
      expect(errorsFor({ specs: [{ key: "Year", value: "" }] }).specs).toBeDefined();
      expect(errorsFor({ specs: [{ key: "", value: "2024" }] }).specs).toBeDefined();
    });

    it("caps how many details a listing carries", () => {
      const many = Array.from({ length: MAX_SPECS + 1 }, (_, i) => ({
        key: `Key ${i}`,
        value: `Value ${i}`,
      }));
      expect(errorsFor({ specs: many }).specs).toBeDefined();
    });
  });

  it("holds the description between a sentence and a page", () => {
    expect(errorsFor({ description: "Nice car." }).description).toBeDefined();
    expect(
      errorsFor({ description: "x".repeat(MAX_DESCRIPTION + 1) }).description,
    ).toBeDefined();
  });

  it("trims before measuring, so spaces are not content", () => {
    expect(errorsFor({ name: "  A  " }).name).toBeDefined();
    expect(errorsFor({ category: "   " }).category).toBeDefined();
  });
});
