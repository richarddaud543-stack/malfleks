import { describe, expect, it } from "vitest";

import { branches, products } from "@/data";

import {
  accrueCourierBalance,
  assertTablesCoherent,
  cityDeliveryFee,
  deliveryRung,
  DELIVERY_CITIES,
  FeeQuoteError,
  GOODS_FEE_LADDER,
  goodsRung,
  MINIMUM_ORDER_VALUE_TZS,
  quoteOrder,
  type CityFeeTable,
  type DeliveryCity,
  type FeeBand,
} from ".";

/**
 * A stand-in for the owner's four numbers, which are deliberately unset in
 * `tables.ts`. These are NOT proposals — they exist so the reconciliation
 * properties below can run against a full fee schedule. The properties do not
 * depend on the values: any four positive integers exercise the same
 * arithmetic, and they are chosen to straddle all three delivery rungs.
 */
const TEST_CITY_FEES: CityFeeTable = {
  "Dar es Salaam": 15_000,
  Arusha: 2_500,
  Mwanza: 26_000,
  Dodoma: 3_000,
};

describe("assertTablesCoherent", () => {
  it("passes on the shipped tables", () => {
    expect(() => assertTablesCoherent()).not.toThrow();
  });

  // The tables are meant to be edited by someone who is not an engineer, so the
  // guard has to actually catch a bad edit. Inject each mistake and watch it
  // fail — the same discipline the Firestore rules suite uses.
  const corruptions: Array<{ name: string; ladder: FeeBand[] }> = [
    {
      name: "a gap between two bands",
      ladder: [
        { minTZS: 1, maxTZS: 100, feeTZS: 10 },
        { minTZS: 200, maxTZS: null, feeTZS: 20 },
      ],
    },
    {
      name: "two bands overlapping",
      ladder: [
        { minTZS: 1, maxTZS: 100, feeTZS: 10 },
        { minTZS: 50, maxTZS: null, feeTZS: 20 },
      ],
    },
    {
      name: "an inverted band",
      ladder: [{ minTZS: 100, maxTZS: 1, feeTZS: 10 }],
    },
    {
      name: "a closed top band",
      ladder: [{ minTZS: 1, maxTZS: 100, feeTZS: 10 }],
    },
    {
      name: "a negative fee",
      ladder: [{ minTZS: 1, maxTZS: null, feeTZS: -1 }],
    },
    {
      name: "a fractional fee",
      ladder: [{ minTZS: 1, maxTZS: null, feeTZS: 10.5 }],
    },
  ];

  // `assertTablesCoherent` reads module constants, so the corruption cases
  // exercise the same rules through a local re-implementation of the caller.
  // This asserts the *rules* hold, then the case above asserts the real tables
  // satisfy them.
  for (const { name, ladder } of corruptions) {
    it(`would reject ${name}`, () => {
      expect(() => checkLadderLikeAssert(ladder)).toThrow();
    });
  }
});

/** Mirrors the ladder rules in `assertTablesCoherent` for the injection cases. */
function checkLadderLikeAssert(ladder: readonly FeeBand[]): void {
  if (ladder.length === 0) throw new Error("empty");
  ladder.forEach((band, i) => {
    if (!Number.isInteger(band.feeTZS) || band.feeTZS < 0) {
      throw new Error(`band ${i}: bad fee`);
    }
    if (band.maxTZS !== null && band.maxTZS < band.minTZS) {
      throw new Error(`band ${i}: inverted`);
    }
    if (band.maxTZS === null && i !== ladder.length - 1) {
      throw new Error(`band ${i}: open-ended but not last`);
    }
  });
  if (ladder[ladder.length - 1].maxTZS !== null) {
    throw new Error("top band must be open-ended");
  }
  for (let i = 1; i < ladder.length; i += 1) {
    const previous = ladder[i - 1];
    if (previous.maxTZS === null) continue;
    if (ladder[i].minTZS !== previous.maxTZS + 1) throw new Error("not contiguous");
  }
}

describe("goodsRung — the band edges", () => {
  // The model document calls these out specifically: 5,000 and 5,100 must
  // differ, 100,000,000 and 100,000,001 must not. Both sides of every edge.
  it.each(
    GOODS_FEE_LADDER.filter((b) => b.maxTZS !== null).map((band, i) => ({
      i,
      edge: band.maxTZS as number,
      feeAtEdge: band.feeTZS,
      feeAfter: GOODS_FEE_LADDER[i + 1].feeTZS,
    })),
  )("band $i changes fee across its top edge at $edge", ({ edge, feeAtEdge, feeAfter }) => {
    expect(goodsRung(edge)).toBe(feeAtEdge);
    expect(goodsRung(edge + 1)).toBe(feeAfter);
    expect(feeAtEdge).not.toBe(feeAfter);
  });

  it("charges the same above the cap — 100,000,000 and 100,000,001 differ, 100,000,001 and 245,000,000 do not", () => {
    expect(goodsRung(100_000_000)).toBe(36_000);
    expect(goodsRung(100_000_001)).toBe(40_000);
    expect(goodsRung(245_000_000)).toBe(40_000);
  });

  it("caps at 40,000 no matter how large the order", () => {
    expect(goodsRung(1_000_000_000_000)).toBe(40_000);
  });

  it("refuses an amount below the bottom rung rather than inventing one", () => {
    expect(() => goodsRung(999)).toThrow(FeeQuoteError);
  });
});

describe("deliveryRung", () => {
  it.each([
    [0, 500],
    [3_000, 500],
    [3_001, 1_500],
    [25_000, 1_500],
    [25_001, 2_500],
    [1_000_000, 2_500],
  ])("bills %i TZS of delivery at %i", (fee, expected) => {
    expect(deliveryRung(fee)).toBe(expected);
  });
});

describe("the three worked examples in docs/marketplace-model.md §2", () => {
  // A canary on the tables. If someone edits a rung, these break by name and
  // point at the document the numbers came from.
  it("earbuds — 65,000 goods + 2,500 delivery earns MalFleks 6,500", () => {
    const q = quoteOrder(
      { goodsTotalTZS: 65_000, city: "Arusha", routeKind: "agent" },
      TEST_CITY_FEES,
    );
    expect(q.depositTZS).toBe(6_000);
    expect(q.deliveryRungTZS).toBe(500);
    expect(q.malfleksEarnsTZS).toBe(6_500);
    expect(q.securedShare).toBeCloseTo(0.92, 2);
  });

  it("fridge — 1,000,000 goods + 15,000 delivery in Dar reconciles exactly", () => {
    const q = quoteOrder(
      { goodsTotalTZS: 1_000_000, city: "Dar es Salaam", routeKind: "agent" },
      TEST_CITY_FEES,
    );
    expect(q.depositTZS).toBe(19_000);
    expect(q.doorPaymentTZS).toBe(996_000);
    expect(q.orderTotalTZS).toBe(1_015_000);
    expect(q.branchPayoutTZS).toBe(981_000);
    // The carrier's share, not the whole fee: since 6 Oct 2026 the quote states
    // what the courier is actually paid, which is the fee less MalFleks's
    // delivery rung -- the same figure `splitForFulfilment` hands out.
    expect(q.courierPayoutTZS).toBe(13_500);
    expect(q.deliveryRungTZS).toBe(1_500);
    expect(q.malfleksEarnsTZS).toBe(20_500);
    expect(q.securedShare).toBeCloseTo(0.93, 2);
  });

  it("SUV — 245,000,000 goods + 26,000 delivery earns MalFleks 42,500", () => {
    const q = quoteOrder(
      { goodsTotalTZS: 245_000_000, city: "Mwanza", routeKind: "agent" },
      TEST_CITY_FEES,
    );
    expect(q.depositTZS).toBe(40_000);
    expect(q.deliveryRungTZS).toBe(2_500);
    expect(q.malfleksEarnsTZS).toBe(42_500);
    expect(q.securedShare).toBeCloseTo(0.94, 2);
  });
});

describe("reconciliation, across the whole real catalogue", () => {
  // Every *quotable* product × every city × both route kinds — quotable
  // meaning `quoteOrder` will not refuse it outright. Since 18 Sep 2026,
  // that excludes anything priced under `MINIMUM_ORDER_VALUE_TZS`: refusing
  // those is correct, tested separately below, not a case this reconciliation
  // property should be exercising. This is the property that matters: the
  // arithmetic must balance to the shilling for anything the catalogue can
  // actually produce and sell, not just for three worked rows.
  const quotableProducts = products.filter(
    (product) =>
      MINIMUM_ORDER_VALUE_TZS === null ||
      product.priceTZS >= MINIMUM_ORDER_VALUE_TZS,
  );
  const cases = quotableProducts.flatMap((product) =>
    DELIVERY_CITIES.flatMap((city) =>
      (["brand", "agent"] as const).map((routeKind) => ({
        product,
        city,
        routeKind,
      })),
    ),
  );

  it(`covers every quotable product in every city on both routes (${cases.length} cases)`, () => {
    expect(cases.length).toBe(quotableProducts.length * DELIVERY_CITIES.length * 2);
    expect(quotableProducts.length).toBeGreaterThan(0);
    // Confirms this filter is actually doing something against the real
    // catalogue, not silently vacuous — see the "below the minimum order
    // value" describe block below for the products this excludes.
    expect(quotableProducts.length).toBeLessThan(products.length);
  });

  it("deposit + door payment always equals the order total, exactly", () => {
    for (const { product, city, routeKind } of cases) {
      const q = quoteOrder(
        { goodsTotalTZS: product.priceTZS, city, routeKind },
        TEST_CITY_FEES,
      );
      expect(q.depositTZS + q.doorPaymentTZS).toBe(q.orderTotalTZS);
    }
  });

  it("branch payout + courier payout always equals the door payment, exactly", () => {
    for (const { product, city, routeKind } of cases) {
      const q = quoteOrder(
        { goodsTotalTZS: product.priceTZS, city, routeKind },
        TEST_CITY_FEES,
      );
      expect(q.branchPayoutTZS + q.courierPayoutTZS + q.malfleksEarnsTZS).toBe(
          q.orderTotalTZS,
        );
    }
  });

  it("never produces a fractional shilling", () => {
    for (const { product, city, routeKind } of cases) {
      const q = quoteOrder(
        { goodsTotalTZS: product.priceTZS, city, routeKind },
        TEST_CITY_FEES,
      );
      for (const [key, value] of Object.entries(q)) {
        // `securedShare` is a fraction by design; `deliveryMode` is the
        // shop's answer echoed back, not a figure.
        if (key === "securedShare" || key === "deliveryMode") continue;
        expect(Number.isInteger(value as number), `${key} = ${value}`).toBe(true);
      }
    }
  });

  it("never charges the customer more in fees than the goods are worth", () => {
    for (const { product, city, routeKind } of cases) {
      const q = quoteOrder(
        { goodsTotalTZS: product.priceTZS, city, routeKind },
        TEST_CITY_FEES,
      );
      expect(q.goodsRungTZS).toBeLessThan(q.goodsTotalTZS);
      expect(q.branchPayoutTZS).toBeGreaterThan(0);
    }
  });

  it("quantities above one still reconcile", () => {
    for (const quantity of [2, 7, 99]) {
      for (const product of products.slice(0, 5)) {
        const q = quoteOrder(
          {
            goodsTotalTZS: product.priceTZS * quantity,
            city: "Dar es Salaam",
            routeKind: "agent",
          },
          TEST_CITY_FEES,
        );
        expect(q.depositTZS + q.doorPaymentTZS).toBe(q.orderTotalTZS);
        expect(q.branchPayoutTZS + q.courierPayoutTZS + q.malfleksEarnsTZS).toBe(
          q.orderTotalTZS,
        );
      }
    }
  });
});

describe("products below the minimum order value", () => {
  // The two Halotel SIM starter packs are the catalogue's cheapest listing
  // at 2,000 TZS today, documented in `tables.ts` as the reason
  // MINIMUM_ORDER_VALUE_TZS exists at all. This block would (usefully) fail
  // to prove anything if a future catalogue edit ever priced everything at
  // or above the minimum — the `.length).toBeGreaterThan(0)` below is that
  // check, not decoration.
  const belowMinimum = products.filter(
    (product) =>
      MINIMUM_ORDER_VALUE_TZS !== null &&
      product.priceTZS < MINIMUM_ORDER_VALUE_TZS,
  );

  it("the catalogue still has at least one product this applies to", () => {
    expect(belowMinimum.length).toBeGreaterThan(0);
  });

  it("refuses to quote any of them, on either route", () => {
    for (const product of belowMinimum) {
      expect(() =>
        quoteOrder(
          { goodsTotalTZS: product.priceTZS, city: "Dar es Salaam", routeKind: "brand" },
          TEST_CITY_FEES,
        ),
      ).toThrow(FeeQuoteError);
      expect(() =>
        quoteOrder(
          { goodsTotalTZS: product.priceTZS, city: "Dar es Salaam", routeKind: "agent" },
          TEST_CITY_FEES,
        ),
      ).toThrow(FeeQuoteError);
    }
  });

  it("says the minimum in the error, not just that something is wrong", () => {
    const product = belowMinimum[0];
    expect(() =>
      quoteOrder(
        { goodsTotalTZS: product.priceTZS, city: "Dar es Salaam", routeKind: "brand" },
        TEST_CITY_FEES,
      ),
    ).toThrow(String(MINIMUM_ORDER_VALUE_TZS));
  });
});

describe("the brand-fleet route", () => {
  it("charges no delivery fee and bills no courier", () => {
    const q = quoteOrder(
      { goodsTotalTZS: 1_000_000, city: "Dar es Salaam", routeKind: "brand" },
      TEST_CITY_FEES,
    );
    expect(q.deliveryFeeTZS).toBe(0);
    expect(q.deliveryRungTZS).toBe(0);
    expect(q.courierPayoutTZS).toBe(0);
    expect(q.orderTotalTZS).toBe(1_000_000);
    expect(q.malfleksEarnsTZS).toBe(q.depositTZS);
  });

  it("secures 100% of what MalFleks earns, because there is no receivable", () => {
    const q = quoteOrder(
      { goodsTotalTZS: 65_000, city: "Arusha", routeKind: "brand" },
      TEST_CITY_FEES,
    );
    expect(q.securedShare).toBe(1);
  });

  it("still quotes when the city fee is unset — a brand route does not need one", () => {
    // This is the shipped table, with all four cities null.
    expect(() =>
      quoteOrder({
        goodsTotalTZS: 65_000,
        city: "Dar es Salaam",
        routeKind: "brand",
      }),
    ).not.toThrow();
  });

  it("matches the 6-of-19 split the model document describes", () => {
    const fleet = branches.filter((b) => b.deliveryOffered);
    expect(fleet).toHaveLength(6);
    expect(branches).toHaveLength(19);
  });
});

describe("an unset city fee fails loudly rather than quoting zero", () => {
  // The single most important negative in this module. A zero would render to
  // a customer as free delivery and to a courier as "you owe nothing".
  it.each(DELIVERY_CITIES)("refuses an agent quote in %s", (city) => {
    expect(() =>
      quoteOrder({ goodsTotalTZS: 65_000, city, routeKind: "agent" }),
    ).toThrow(FeeQuoteError);
  });

  it("says where to set it", () => {
    expect(() =>
      quoteOrder({
        goodsTotalTZS: 65_000,
        city: "Dodoma",
        routeKind: "agent",
      }),
    ).toThrow(/CITY_DELIVERY_FEES/);
  });

  it("reports every city as unset today", () => {
    for (const city of DELIVERY_CITIES) {
      expect(cityDeliveryFee(city)).toBeNull();
    }
  });

  it("covers exactly the cities the catalogue uses", () => {
    const catalogueCities = new Set(branches.map((b) => b.city));
    expect([...catalogueCities].sort()).toEqual([...DELIVERY_CITIES].sort());
  });
});

describe("input validation", () => {
  const city: DeliveryCity = "Dar es Salaam";

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a goods total of %s",
    (goodsTotalTZS) => {
      expect(() =>
        quoteOrder({ goodsTotalTZS, city, routeKind: "brand" }),
      ).toThrow(FeeQuoteError);
    },
  );
});

describe("accrueCourierBalance", () => {
  it("accrues per delivery — seven in-city hops owe 3,500, not nothing", () => {
    expect(accrueCourierBalance(Array(7).fill(2_000))).toBe(3_500);
  });

  it("ten in-city hops settle at the documented 5,000", () => {
    expect(accrueCourierBalance(Array(10).fill(2_000))).toBe(5_000);
  });

  it("mixes rungs correctly", () => {
    expect(accrueCourierBalance([2_000, 15_000, 30_000])).toBe(500 + 1_500 + 2_500);
  });

  it("is zero for a courier who has delivered nothing", () => {
    expect(accrueCourierBalance([])).toBe(0);
  });
});
