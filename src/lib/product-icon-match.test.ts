import { describe, it, expect } from "vitest";
import { matchProductIcons } from "./product-icon-match";
import { PRODUCT_ICON_KEYS } from "./product-icons";

describe("matchProductIcons", () => {
  it("returns nothing for a blank query, so the caller shows the full grid", () => {
    expect(matchProductIcons("")).toEqual([]);
    expect(matchProductIcons("   ")).toEqual([]);
  });

  it("ranks an exact label match first", () => {
    const result = matchProductIcons("fridge");
    expect(result[0]).toBe("fridge");
  });

  it("matches a Tanzania-specific keyword to its icon", () => {
    expect(matchProductIcons("boda boda")[0]).toBe("motorcycle");
    expect(matchProductIcons("friji")[0]).toBe("fridge");
    expect(matchProductIcons("mtungi wa gesi")).toContain("gas-cylinder");
  });

  it("matches a model name to its category rather than the brand's own products", () => {
    expect(matchProductIcons("Toyota Corolla")[0]).toBe("sedan");
    expect(matchProductIcons("Land Cruiser Prado")[0]).toBe("suv");
    expect(matchProductIcons("Ford Ranger")[0]).toBe("pickup");
  });

  it("is case-insensitive and tolerant of extra whitespace", () => {
    expect(matchProductIcons("  IPHONE  ")[0]).toBe("smartphone");
  });

  it("distinguishes a gaming console from a games controller wording", () => {
    expect(matchProductIcons("PS5 controller")[0]).toBe("console");
  });

  it("returns nothing for a query that matches no keyword or label", () => {
    expect(matchProductIcons("xyzzy plugh")).toEqual([]);
  });

  it("never returns a key outside the known set", () => {
    for (const key of matchProductIcons("phone charger cable")) {
      expect(PRODUCT_ICON_KEYS).toContain(key);
    }
  });

  it("respects the limit parameter", () => {
    expect(matchProductIcons("a", 2).length).toBeLessThanOrEqual(2);
  });
});
