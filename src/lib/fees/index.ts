/**
 * What Soko earns on an order, and who pays whom.
 *
 * A pure function over the tables in `./tables.ts`. No I/O, no Prisma, no
 * Supabase, no imports from `src/server` — the same shape as `buildListings`
 * and `previewDelivery`, and for the same reason: money bugs are the worst
 * kind, and a pure function is the only part worth trusting. Everything here
 * can be exercised exhaustively over the real catalogue in milliseconds, which
 * is what `fees.test.ts` does.
 *
 * ## The money loop, in one place
 *
 * The customer pays a **deposit** at order time by mobile money, equal to the
 * goods rung and nothing else. Everything after that settles at the door, in
 * cash or direct mobile money, between the customer, the branch and the
 * courier — Soko never touches it. Afterwards the courier owes Soko its
 * delivery rung, accruing on their partner page.
 *
 * Two invariants hold for every quote this module produces, and both are
 * asserted as properties across the whole catalogue:
 *
 *   deposit + doorPayment === orderTotal
 *   branchPayout + courierPayout === doorPayment
 *
 * Exactly, to the shilling. There is no tolerance because there is no rounding:
 * every figure is a whole number of Tanzanian shillings and every band edge is
 * exact. See `docs/marketplace-model.md` §2.
 *
 * ## What this module is not
 *
 * It does not collect anything, and it holds no credential. Soko still takes no
 * money at all: the order flow produces a *request*, and nothing here may be
 * rendered to a customer as though a payment had been taken or authorised.
 * Wiring a deposit figure into a customer-facing page is a separate, later
 * decision that needs a merchant account behind it.
 */

import {
  BRAND_FLEET_EARNS_DELIVERY_RUNG,
  CITY_DELIVERY_FEES,
  DELIVERY_FEE_LADDER,
  GOODS_FEE_LADDER,
  MINIMUM_ORDER_VALUE_TZS,
  type DeliveryCity,
  type FeeBand,
  type TZS,
} from "./tables";

export {
  assertTablesCoherent,
  BRAND_FLEET_EARNS_DELIVERY_RUNG,
  CITY_DELIVERY_FEES,
  DELIVERY_CITIES,
  DELIVERY_FEE_LADDER,
  GOODS_FEE_LADDER,
  MINIMUM_ORDER_VALUE_TZS,
  type DeliveryCity,
  type FeeBand,
  type TZS,
} from "./tables";

/**
 * Which carrier a quote is for. Mirrors `DeliveryRouteKind` in
 * `src/lib/order.ts` rather than importing it, so this module stays free of
 * every other dependency that file carries.
 */
export type FeeRouteKind = "brand" | "agent";

export interface QuoteInput {
  /** The goods payment: unit price × quantity, before any fee. */
  goodsTotalTZS: TZS;
  /** Must be one of `DELIVERY_CITIES`. */
  city: DeliveryCity;
  /** `"brand"` for the brand's own fleet, `"agent"` for a local courier. */
  routeKind: FeeRouteKind;
}

export interface Quote {
  /** The goods payment this quote was computed from, echoed back. */
  goodsTotalTZS: TZS;

  /** Soko's platform fee on the goods. The customer pays this as the deposit. */
  goodsRungTZS: TZS;

  /**
   * What the customer pays the courier at the door for delivery. Zero on a
   * brand route, where the brand carries it and no delivery fee is charged.
   */
  deliveryFeeTZS: TZS;

  /**
   * What the courier owes Soko for this delivery, accruing on their partner
   * page. Zero on a brand route — no courier, nothing to bill.
   */
  deliveryRungTZS: TZS;

  /** Paid now, by mobile money. Equal to `goodsRungTZS`. */
  depositTZS: TZS;

  /** Paid at the door, in cash or direct mobile money. Soko never touches it. */
  doorPaymentTZS: TZS;

  /** Goods plus delivery. What the order costs the customer in total. */
  orderTotalTZS: TZS;

  /** The branch's share of the door payment. */
  branchPayoutTZS: TZS;

  /** The courier's share of the door payment, before it settles its rung. */
  courierPayoutTZS: TZS;

  /**
   * Soko's total revenue on this order: the deposit plus the courier's rung.
   * The deposit half is secured before anyone moves; the rung half is credit.
   */
  sokoEarnsTZS: TZS;

  /**
   * How much of `sokoEarnsTZS` was secured upfront, as a fraction between 0
   * and 1. `docs/marketplace-model.md` quotes 92–94% across the catalogue's
   * real range. Derived, never stored.
   */
  securedShare: number;
}

/** Thrown when a quote cannot honestly be produced. Never returns a zero instead. */
export class FeeQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeeQuoteError";
  }
}

/**
 * The fee for `amountTZS` on a ladder. Bands are inclusive at both ends and the
 * top band is open-ended, both guaranteed by `assertTablesCoherent()`.
 */
function feeForAmount(amountTZS: TZS, ladder: readonly FeeBand[]): TZS {
  for (const band of ladder) {
    if (amountTZS < band.minTZS) continue;
    if (band.maxTZS === null || amountTZS <= band.maxTZS) return band.feeTZS;
  }
  // Reachable only for an amount below the ladder's first rung — a 500 TZS
  // order against a ladder starting at 1,000. Silently charging the bottom rung
  // would be inventing a policy the model document does not state.
  throw new FeeQuoteError(
    `No fee band covers ${amountTZS} TZS. The ladder starts at ${ladder[0].minTZS}.`,
  );
}

/** Soko's platform fee on a goods payment. Exported for display and testing. */
export function goodsRung(goodsTotalTZS: TZS): TZS {
  return feeForAmount(goodsTotalTZS, GOODS_FEE_LADDER);
}

/** What Soko bills a courier for a delivery that cost `deliveryFeeTZS`. */
export function deliveryRung(deliveryFeeTZS: TZS): TZS {
  return feeForAmount(deliveryFeeTZS, DELIVERY_FEE_LADDER);
}

/** A per-city delivery fee table. `null` means the owner has not set that city. */
export type CityFeeTable = Readonly<Record<DeliveryCity, TZS | null>>;

/**
 * The delivery fee Soko charges in a city, or `null` if the owner has not set
 * one yet. Callers that need a number must handle `null` — see the note on
 * `CITY_DELIVERY_FEES`.
 */
export function cityDeliveryFee(
  city: DeliveryCity,
  fees: CityFeeTable = CITY_DELIVERY_FEES,
): TZS | null {
  return fees[city] ?? null;
}

/**
 * Everything Soko needs to know about the money on one order.
 *
 * `fees` defaults to the live table and exists so the reconciliation properties
 * can be exercised across a real fee schedule while the owner's four numbers are
 * still unset — the same reason `searchProducts` takes `listings` as a second
 * parameter. **Production callers pass one argument.** Passing a table from
 * anywhere a client can influence would let the caller name its own delivery
 * fee, which is the trust boundary `buildOrderRequest` exists to hold.
 *
 * @throws {FeeQuoteError} if the goods total is not a positive whole number, is
 *   below `MINIMUM_ORDER_VALUE_TZS`, falls outside the goods ladder, or — on an
 *   agent route — the city has no delivery fee set yet.
 */
export function quoteOrder(
  { goodsTotalTZS, city, routeKind }: QuoteInput,
  fees: CityFeeTable = CITY_DELIVERY_FEES,
): Quote {
  if (!Number.isInteger(goodsTotalTZS) || goodsTotalTZS <= 0) {
    throw new FeeQuoteError(
      `goodsTotalTZS must be a positive whole number of shillings, got ${goodsTotalTZS}.`,
    );
  }

  if (
    MINIMUM_ORDER_VALUE_TZS !== null &&
    goodsTotalTZS < MINIMUM_ORDER_VALUE_TZS
  ) {
    throw new FeeQuoteError(
      `Order of ${goodsTotalTZS} TZS is below the ${MINIMUM_ORDER_VALUE_TZS} TZS minimum.`,
    );
  }

  const goodsRungTZS = goodsRung(goodsTotalTZS);

  // On a brand route the brand carries the goods itself: no courier, no
  // delivery fee charged, and nothing for Soko to bill afterwards.
  let deliveryFeeTZS = 0;
  let deliveryRungTZS = 0;

  if (routeKind === "agent") {
    const fee = cityDeliveryFee(city, fees);
    if (fee === null) {
      throw new FeeQuoteError(
        `No delivery fee is set for ${city}. Set it in CITY_DELIVERY_FEES ` +
          `(src/lib/fees/tables.ts) — quoting zero would read as free delivery.`,
      );
    }
    deliveryFeeTZS = fee;
    deliveryRungTZS = deliveryRung(fee);
  } else if (BRAND_FLEET_EARNS_DELIVERY_RUNG) {
    // Only reachable if the owner answers open question 5 the other way. Left
    // explicit rather than dropped, so the flag in `tables.ts` is not a lie.
    const fee = cityDeliveryFee(city, fees);
    if (fee !== null) {
      deliveryFeeTZS = fee;
      deliveryRungTZS = deliveryRung(fee);
    }
  }

  const orderTotalTZS = goodsTotalTZS + deliveryFeeTZS;
  const depositTZS = goodsRungTZS;
  const doorPaymentTZS = orderTotalTZS - depositTZS;

  // The branch keeps the goods payment less the rung the customer already paid
  // Soko; the courier collects the delivery fee whole and settles its rung
  // afterwards, out of band. Together these are exactly the cash at the door.
  const branchPayoutTZS = goodsTotalTZS - goodsRungTZS;
  const courierPayoutTZS = deliveryFeeTZS;

  const sokoEarnsTZS = depositTZS + deliveryRungTZS;

  return {
    goodsTotalTZS,
    goodsRungTZS,
    deliveryFeeTZS,
    deliveryRungTZS,
    depositTZS,
    doorPaymentTZS,
    orderTotalTZS,
    branchPayoutTZS,
    courierPayoutTZS,
    sokoEarnsTZS,
    securedShare: sokoEarnsTZS === 0 ? 0 : depositTZS / sokoEarnsTZS,
  };
}

/**
 * What a courier owes Soko across a batch of deliveries.
 *
 * The bottom rung of `DELIVERY_FEE_LADDER` is described in the model document
 * as "5,000 per 10 deliveries". That is a settlement cadence, not a different
 * rate: the balance **accrues** per delivery, and a courier who stops at seven
 * in-city deliveries owes 3,500 rather than nothing. `docs/marketplace-model.md`
 * §2 states that assumption explicitly and flags the alternative as the owner's
 * call — if they decide otherwise, this function is where it changes.
 */
export function accrueCourierBalance(deliveryFees: readonly TZS[]): TZS {
  return deliveryFees.reduce((total, fee) => total + deliveryRung(fee), 0);
}
