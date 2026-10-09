import { describe, expect, it } from "vitest";

import {
  DELIVERY_MODES,
  DEFAULT_DELIVERY_MODE,
  isDeliveryMode,
  splitDeliveryFee,
  type DeliveryMode,
} from "./tables";
import { FeeQuoteError, quoteOrder, type CityFeeTable } from "./index";

/**
 * Who pays for delivery, and the arithmetic that follows from it.
 *
 * The owner decided on 6 Oct 2026 that the customer pays the delivery fee, that
 * a shop may split it or carry it, and that the delivery person is paid in full
 * either way. These tests are that decision, written down in a form that breaks
 * if someone quietly changes it.
 *
 * The city table is passed in rather than read from `CITY_DELIVERY_FEES`: the
 * owner has not set his four numbers yet, and these properties must hold
 * whatever he picks. Same pattern as `fees.test.ts`.
 */

const FEES: CityFeeTable = {
  "Dar es Salaam": 5_000,
  Arusha: 4_000,
  Mwanza: 4_000,
  Dodoma: 4_001, // odd on purpose -- see the half-shilling test
};

const agent = (goods: number, mode: DeliveryMode, city: keyof typeof FEES = "Dar es Salaam") =>
  quoteOrder({ goodsTotalTZS: goods, city, routeKind: "agent", deliveryMode: mode }, FEES);

describe("splitDeliveryFee — the rule, on its own", () => {
  it("gives the whole fee to the customer under customer_pays", () => {
    expect(splitDeliveryFee(5_000, "customer_pays")).toEqual({ customerTZS: 5_000, shopTZS: 0 });
  });

  it("gives the whole fee to the shop under shop_delivers", () => {
    expect(splitDeliveryFee(5_000, "shop_delivers")).toEqual({ customerTZS: 0, shopTZS: 5_000 });
  });

  it("halves it under split", () => {
    expect(splitDeliveryFee(5_000, "split")).toEqual({ customerTZS: 2_500, shopTZS: 2_500 });
  });

  it("gives the odd shilling to the shop, never the customer", () => {
    // A customer quoted 2,500 and charged 2,501 has been lied to. A shop that
    // gives up one shilling has not.
    expect(splitDeliveryFee(4_001, "split")).toEqual({ customerTZS: 2_000, shopTZS: 2_001 });
  });

  it("always adds back up to the fee, for every mode and every fee", () => {
    for (const mode of DELIVERY_MODES) {
      for (let fee = 0; fee <= 20_000; fee += 1) {
        const { customerTZS, shopTZS } = splitDeliveryFee(fee, mode);
        expect(customerTZS + shopTZS).toBe(fee);
        expect(Number.isInteger(customerTZS)).toBe(true);
        expect(Number.isInteger(shopTZS)).toBe(true);
        expect(customerTZS).toBeGreaterThanOrEqual(0);
        expect(shopTZS).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("refuses a fee that is not a whole number of shillings", () => {
    expect(() => splitDeliveryFee(2_500.5, "split")).toThrow();
    expect(() => splitDeliveryFee(-1, "customer_pays")).toThrow();
  });
});

describe("isDeliveryMode — what a form may send", () => {
  it("accepts the three real answers", () => {
    for (const mode of DELIVERY_MODES) expect(isDeliveryMode(mode)).toBe(true);
  });

  it("refuses anything else, including an empty answer", () => {
    for (const value of ["", "free", "SPLIT", "customer", null, undefined, 1, {}]) {
      expect(isDeliveryMode(value)).toBe(false);
    }
  });
});

describe("the default", () => {
  it("is customer_pays, so an unanswered shop prices exactly as it did before", () => {
    // Every shop approved before 6 Oct 2026 has no answer on file. If this
    // default ever changes, those shops' orders silently re-price.
    expect(DEFAULT_DELIVERY_MODE).toBe("customer_pays");
  });

  it("is what quoteOrder uses when no mode is given", () => {
    const given = agent(80_000, "customer_pays");
    const omitted = quoteOrder(
      { goodsTotalTZS: 80_000, city: "Dar es Salaam", routeKind: "agent" },
      FEES,
    );
    expect(omitted).toEqual(given);
  });
});

describe("quoteOrder — what the customer is charged", () => {
  it("adds the whole fee to the order total under customer_pays", () => {
    const quote = agent(80_000, "customer_pays");
    expect(quote.customerDeliveryTZS).toBe(5_000);
    expect(quote.shopDeliveryShareTZS).toBe(0);
    expect(quote.orderTotalTZS).toBe(85_000);
  });

  it("adds half under split, and takes the other half off the shop", () => {
    const quote = agent(80_000, "split");
    expect(quote.customerDeliveryTZS).toBe(2_500);
    expect(quote.shopDeliveryShareTZS).toBe(2_500);
    expect(quote.orderTotalTZS).toBe(82_500);
    // 80,000 goods − 6,000 rung − 2,500 the shop agreed to carry
    expect(quote.branchPayoutTZS).toBe(71_500);
  });

  it("charges the customer nothing under shop_delivers, and bills the shop", () => {
    const quote = agent(80_000, "shop_delivers");
    expect(quote.customerDeliveryTZS).toBe(0);
    expect(quote.orderTotalTZS).toBe(80_000);
    expect(quote.shopDeliveryShareTZS).toBe(5_000);
    expect(quote.branchPayoutTZS).toBe(80_000 - 6_000 - 5_000);
  });

  it("pays the courier the same under all three modes", () => {
    // The whole point of the split rule: a deal between the shop and the
    // customer is not the delivery person's problem.
    const payouts = DELIVERY_MODES.map((mode) => agent(80_000, mode).courierPayoutTZS);
    expect(new Set(payouts).size).toBe(1);
    // The fee less MalFleks's delivery rung, which is 1,500 on a 5,000 fee.
    expect(payouts[0]).toBe(3_500);
  });

  it("earns MalFleks the same under all three modes", () => {
    const earned = DELIVERY_MODES.map((mode) => agent(80_000, mode).malfleksEarnsTZS);
    expect(new Set(earned).size).toBe(1);
    expect(earned[0]).toBe(6_000 + 1_500);
  });

  it("echoes the mode back, so an order can freeze it", () => {
    expect(agent(80_000, "split").deliveryMode).toBe("split");
  });

  it("charges no delivery on a brand route, whatever the shop answered", () => {
    for (const mode of DELIVERY_MODES) {
      const quote = quoteOrder(
        { goodsTotalTZS: 80_000, city: "Dar es Salaam", routeKind: "brand", deliveryMode: mode },
        FEES,
      );
      expect(quote.deliveryFeeTZS).toBe(0);
      expect(quote.customerDeliveryTZS).toBe(0);
      expect(quote.shopDeliveryShareTZS).toBe(0);
      expect(quote.orderTotalTZS).toBe(80_000);
    }
  });
});

describe("quoteOrder — the reconciliation that matters", () => {
  it("accounts for every shilling the customer paid, across the catalogue's range", () => {
    // orderTotal === branchPayout + courierPayout + malfleksEarns, exactly.
    // This replaced `branchPayout + courierPayout === doorPayment`, which
    // stopped being true the moment a shop could carry part of the fee.
    let checked = 0;
    for (const mode of DELIVERY_MODES) {
      for (const city of Object.keys(FEES) as (keyof typeof FEES)[]) {
        for (const goods of [5_000, 9_999, 25_000, 80_000, 320_000, 1_000_000, 5_000_000]) {
          let quote;
          try {
            quote = agent(goods, mode, city);
          } catch (error) {
            // The one honest way out: an order too small to carry the delivery
            // share the shop agreed to. Refusing is the documented behaviour
            // (see the next describe), so it is not a hole in this property.
            expect(error).toBeInstanceOf(FeeQuoteError);
            continue;
          }
          expect(quote.branchPayoutTZS + quote.courierPayoutTZS + quote.malfleksEarnsTZS).toBe(
            quote.orderTotalTZS,
          );
          checked += 1;
        }
      }
    }
    // Guard against the loop quietly refusing everything and passing.
    expect(checked).toBeGreaterThan(70);
  });

  it("holds on a brand route too", () => {
    for (const goods of [5_000, 80_000, 1_000_000]) {
      const quote = quoteOrder(
        { goodsTotalTZS: goods, city: "Arusha", routeKind: "brand" },
        FEES,
      );
      expect(quote.branchPayoutTZS + quote.courierPayoutTZS + quote.malfleksEarnsTZS).toBe(
        quote.orderTotalTZS,
      );
    }
  });

  it("never returns a figure that is not a whole number of shillings", () => {
    for (const mode of DELIVERY_MODES) {
      const quote = agent(80_000, mode, "Dodoma"); // the odd 4,001 fee
      for (const [key, value] of Object.entries(quote)) {
        if (key === "securedShare" || key === "deliveryMode") continue;
        expect(Number.isInteger(value), `${key} = ${value}`).toBe(true);
      }
    }
  });
});

describe("quoteOrder — refusing rather than paying a shop a negative amount", () => {
  it("refuses when the shop's delivery share would exceed what it earns", () => {
    // A 5,000 order, 500 rung, and a 5,000 delivery the shop said it carries:
    // the shop would owe MalFleks 500, and the ledger has no way to say that.
    expect(() => agent(5_000, "shop_delivers")).toThrow(FeeQuoteError);
  });

  it("still quotes the same order when the customer pays the delivery", () => {
    const quote = agent(5_000, "customer_pays");
    expect(quote.orderTotalTZS).toBe(10_000);
    expect(quote.branchPayoutTZS).toBe(4_500);
  });

  it("names the mode and the shortfall, so the owner can act on it", () => {
    try {
      agent(5_000, "shop_delivers");
      expect.unreachable("should have refused");
    } catch (error) {
      expect(String(error)).toContain("shop_delivers");
      expect(String(error)).toContain("500");
    }
  });
});
