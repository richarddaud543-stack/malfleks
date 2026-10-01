import { describe, expect, it } from "vitest";

import { catalogueWhere, validateProductEdit } from "./catalogue";
import { eatMidnight, orderWhere } from "./orders";

describe("eatMidnight", () => {
  it("is midnight in Dar es Salaam, which is 21:00 UTC the day before", () => {
    expect(eatMidnight("2026-10-02")?.toISOString()).toBe("2026-10-01T21:00:00.000Z");
  });
  it.each(["", "2026-1-2", "02/10/2026", "2026-13-45"])("rejects %s", (value) => {
    expect(eatMidnight(value)).toBeNull();
  });
});

describe("orderWhere", () => {
  it("is empty with no filters", () => {
    expect(orderWhere({})).toEqual({});
  });

  it("finds a phone however it was typed", () => {
    for (const typed of ["0754 123 456", "+255754123456", "754123456"]) {
      const where = JSON.stringify(orderWhere({ q: typed }));
      expect(where).toContain('"customerPhone":{"contains":"754123456"}');
    }
  });

  it("does not phone-search short numbers that would match everything", () => {
    expect(JSON.stringify(orderWhere({ q: "12" }))).not.toContain("customerPhone");
  });

  it("ignores an unknown status rather than matching nothing", () => {
    expect(orderWhere({ status: "shipped" })).toEqual({});
  });

  it("can leave the status out, for the chip counts", () => {
    expect(orderWhere({ status: "pending" }, { ignoreStatus: true })).toEqual({});
  });

  it("treats 'link sent' and 'failed' as not yet captured", () => {
    expect(orderWhere({ payment: "pending" })).toEqual({
      AND: [{ payments: { some: { status: "pending" }, none: { status: "captured" } } }],
    });
  });

  it("makes 'to' inclusive of that whole day", () => {
    const where = orderWhere({ from: "2026-10-01", to: "2026-10-01" }) as { AND: { createdAt: { gte?: Date; lt?: Date } }[] };
    expect(where.AND[0].createdAt.gte?.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(where.AND[1].createdAt.lt?.toISOString()).toBe("2026-10-01T21:00:00.000Z");
  });
});

describe("validateProductEdit", () => {
  const ok = { name: "Toyota Corolla", priceTZS: "68,000,000", description: "A reliable, fuel-efficient sedan.", inStock: true };

  it("accepts commas and spaces in the price", () => {
    expect(validateProductEdit(ok)).toEqual({
      ok: true,
      value: { name: "Toyota Corolla", priceTZS: 68_000_000, description: "A reliable, fuel-efficient sedan.", inStock: true },
    });
  });

  it.each(["0", "-5", "12.5", "abc", "", "99999999999"])("rejects price %s", (price) => {
    expect(validateProductEdit({ ...ok, priceTZS: price })).toEqual({ ok: false, reason: "bad-price" });
  });

  it("rejects an empty name and a too-short description", () => {
    expect(validateProductEdit({ ...ok, name: " " })).toEqual({ ok: false, reason: "bad-name" });
    expect(validateProductEdit({ ...ok, description: "short" })).toEqual({ ok: false, reason: "bad-description" });
  });

  it("tidies whitespace in the name", () => {
    const result = validateProductEdit({ ...ok, name: "  Toyota   Corolla " });
    expect(result.ok && result.value.name).toBe("Toyota Corolla");
  });
});

describe("catalogueWhere", () => {
  it("filters hidden and out-of-stock", () => {
    expect(catalogueWhere({ show: "hidden", stock: "out" })).toEqual({
      AND: [{ inStock: false }, { hiddenAt: { not: null } }],
    });
  });
});
