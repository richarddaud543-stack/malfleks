import { describe, expect, it } from "vitest";

import { quoteOrder } from "@/lib/fees";
import { splitForFulfilment, toPayoutPhone, type SplitInput } from "./payout-rules";

/** An order row as `createOrder` would have snapshotted it from a real quote. */
function orderFrom(goodsTotalTZS: number, routeKind: "brand" | "agent", deliveryFee: number | null): SplitInput {
  const q = quoteOrder(
    { goodsTotalTZS, city: "Dar es Salaam", routeKind },
    { "Dar es Salaam": deliveryFee, Arusha: null, Mwanza: null, Dodoma: null } as never,
  );
  return {
    routeKind,
    lineTotalTZS: goodsTotalTZS,
    quoteGoodsRungTZS: q.goodsRungTZS,
    quoteDeliveryFeeTZS: q.deliveryFeeTZS,
    quoteDeliveryRungTZS: q.deliveryRungTZS,
    quoteOrderTotalTZS: q.orderTotalTZS,
  };
}

describe("splitForFulfilment", () => {
  // The invariant the whole ledger rests on: every shilling collected is
  // either owed to a partner or kept as a fee — exactly, never approximately.
  const goods = [5_000, 12_500, 74_999, 250_000, 1_000_000, 45_000_000];
  for (const amount of goods) {
    for (const route of ["brand", "agent"] as const) {
      it(`adds back up to what was captured: ${amount} TZS, ${route} route`, () => {
        const order = orderFrom(amount, route, 3_000);
        const outcome = splitForFulfilment(order, order.quoteOrderTotalTZS!);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { branchTZS, courierTZS, feeTZS } = outcome.split;
        expect(branchTZS + courierTZS + feeTZS).toBe(order.quoteOrderTotalTZS);
        expect(Math.min(branchTZS, courierTZS, feeTZS)).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it("pays the courier the delivery fee less MalFleks's delivery fee, not the whole fee", () => {
    const order = orderFrom(100_000, "agent", 3_000);
    const outcome = splitForFulfilment(order, order.quoteOrderTotalTZS!);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.split.courierTZS).toBe(3_000 - order.quoteDeliveryRungTZS!);
    expect(outcome.split.feeTZS).toBe(order.quoteGoodsRungTZS! + order.quoteDeliveryRungTZS!);
  });

  it("gives a brand-fleet order no courier share", () => {
    const order = orderFrom(100_000, "brand", 3_000);
    const outcome = splitForFulfilment(order, order.quoteOrderTotalTZS!);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.split.courierTZS).toBe(0);
    expect(outcome.split.branchTZS).toBe(100_000 - order.quoteGoodsRungTZS!);
  });

  it("refuses when what was captured isn't the order total", () => {
    const order = orderFrom(100_000, "agent", 3_000);
    expect(splitForFulfilment(order, order.quoteOrderTotalTZS! - 1)).toEqual({ ok: false, reason: "amount-mismatch" });
  });

  it("refuses an order with no quote", () => {
    expect(
      splitForFulfilment(
        { routeKind: "agent", lineTotalTZS: 10_000, quoteGoodsRungTZS: null, quoteDeliveryFeeTZS: null, quoteDeliveryRungTZS: null, quoteOrderTotalTZS: null },
        10_000,
      ),
    ).toEqual({ ok: false, reason: "no-quote" });
  });

  it("refuses a quote whose parts don't add up to its total", () => {
    const order = { ...orderFrom(100_000, "agent", 3_000) };
    order.quoteOrderTotalTZS! += 10;
    expect(splitForFulfilment(order, order.quoteOrderTotalTZS!)).toEqual({ ok: false, reason: "bad-quote" });
  });
});

describe("toPayoutPhone", () => {
  it.each([
    ["+255754123456", "255754123456"],
    ["0754 123 456", "255754123456"],
    ["754123456", "255754123456"],
    ["255 654 123 456", "255654123456"],
  ])("%s → %s", (input, expected) => {
    expect(toPayoutPhone(input)).toBe(expected);
  });

  it.each(["+255222123456", "12345", "", null, undefined])("rejects %s", (input) => {
    expect(toPayoutPhone(input as string | null | undefined)).toBeNull();
  });
});
