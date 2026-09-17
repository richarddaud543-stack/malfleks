import { describe, expect, it } from "vitest";
import type { CityFeeTable } from "@/lib/fees";
import { quoteForOrder } from "./quote-order";

/**
 * A full `OrderRequest`-shaped stub — `quoteForOrder` only reads
 * `lineTotalTZS`, `route.kind` and `branch.city`, but its parameter type is
 * `Pick<OrderRequest, ...>`, which keeps the full field type of each picked
 * property, not just the fields this module happens to use.
 */
function orderStub(overrides: {
  lineTotalTZS: number;
  city: string;
  routeKind: "brand" | "agent";
}) {
  return {
    lineTotalTZS: overrides.lineTotalTZS,
    route: { kind: overrides.routeKind, carrier: "Test carrier" },
    branch: { id: "branch-1", name: "Test branch", city: overrides.city },
  };
}

describe("quoteForOrder", () => {
  it("returns null for an agent route into a city with no fee set", () => {
    // Matches production today: every city in CITY_DELIVERY_FEES is null.
    const order = orderStub({
      lineTotalTZS: 20_000,
      city: "Dar es Salaam",
      routeKind: "agent",
    });
    expect(quoteForOrder(order)).toBeNull();
  });

  it("returns a real quote for an agent route once a fee is supplied", () => {
    const fees: CityFeeTable = {
      "Dar es Salaam": 4_000,
      Arusha: null,
      Mwanza: null,
      Dodoma: null,
    };
    const order = orderStub({
      lineTotalTZS: 20_000,
      city: "Dar es Salaam",
      routeKind: "agent",
    });
    const quote = quoteForOrder(order, fees);
    expect(quote).not.toBeNull();
    expect(quote!.deliveryFeeTZS).toBe(4_000);
    expect(quote!.depositTZS + quote!.doorPaymentTZS).toBe(quote!.orderTotalTZS);
  });

  it("quotes a brand route today, with no city fee needed at all", () => {
    // BRAND_FLEET_EARNS_DELIVERY_RUNG is false, so a brand route never
    // touches CITY_DELIVERY_FEES — this is the one path that is already
    // computable in production right now, before the owner sets anything.
    const order = orderStub({
      lineTotalTZS: 20_000,
      city: "Dar es Salaam",
      routeKind: "brand",
    });
    const quote = quoteForOrder(order);
    expect(quote).not.toBeNull();
    expect(quote!.deliveryFeeTZS).toBe(0);
    expect(quote!.goodsRungTZS).toBeGreaterThan(0);
  });

  it("returns null rather than throwing for a city outside the four served", () => {
    const order = orderStub({
      lineTotalTZS: 20_000,
      city: "Zanzibar",
      routeKind: "agent",
    });
    expect(quoteForOrder(order)).toBeNull();
  });

  it("returns null rather than throwing for a goods total below the ladder", () => {
    // Also exercises the FeeQuoteError catch path via a different trigger
    // than an unset city fee.
    const order = orderStub({
      lineTotalTZS: 500,
      city: "Dar es Salaam",
      routeKind: "brand",
    });
    expect(quoteForOrder(order)).toBeNull();
  });
});
