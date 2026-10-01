/**
 * Who is owed what once an order is delivered — pure arithmetic, no database.
 *
 * Under full escrow the customer pays the whole order to MalFleks up front
 * (`Order.quoteOrderTotalTZS`, captured as an `OrderPayment`). When the order
 * is fulfilled, that money is split three ways and written to the ledger:
 *
 *  - the **branch** keeps the goods money less MalFleks's goods fee:
 *    `lineTotalTZS − quoteGoodsRungTZS`
 *  - the **carrier** keeps the delivery fee less MalFleks's delivery fee:
 *    `quoteDeliveryFeeTZS − quoteDeliveryRungTZS`. On a courier ("agent")
 *    route that is the courier; on the brand's own fleet it is the branch.
 *  - **MalFleks** keeps both fees: `quoteGoodsRungTZS + quoteDeliveryRungTZS`.
 *
 * The three always add up to the order total, to the shilling, and that total
 * must equal what was actually captured — otherwise nothing is split and the
 * admin is told why. Every input is a column `Order` froze at order time, so
 * this never recomputes from today's fee table.
 *
 * ### A correction to the 19 Sep design doc
 *
 * `malfleks-escrow-ledger-design.md` §3 paid the courier the *whole* delivery
 * fee and also counted the delivery rung as MalFleks's. That books the rung
 * twice: the shares would add up to more than the customer paid. Under the old
 * cash-at-the-door model the courier collected the whole fee and *owed* the
 * rung back; under escrow MalFleks already holds it, so the courier's share is
 * the fee minus the rung. The invariant test in `payout-rules.test.ts` is what
 * would have caught it.
 */

export interface SplitInput {
  routeKind: string;
  lineTotalTZS: number;
  quoteGoodsRungTZS: number | null;
  quoteDeliveryFeeTZS: number | null;
  quoteDeliveryRungTZS: number | null;
  quoteOrderTotalTZS: number | null;
}

export interface PayoutSplit {
  /** Goods money, plus the delivery share when the brand delivered it itself. */
  branchTZS: number;
  /** Zero on a brand-fleet route. */
  courierTZS: number;
  /** Retained by MalFleks. Recorded, never paid out. */
  feeTZS: number;
}

export type SplitOutcome =
  | { ok: true; split: PayoutSplit }
  | { ok: false; reason: "no-quote" | "amount-mismatch" | "bad-quote" };

/** ClickPesa's dashboard will not send a mobile-money payout below this. */
export const MIN_MOBILE_PAYOUT_TZS = 2_500;

export function splitForFulfilment(order: SplitInput, capturedTZS: number): SplitOutcome {
  const goodsRung = order.quoteGoodsRungTZS;
  const deliveryFee = order.quoteDeliveryFeeTZS ?? 0;
  const deliveryRung = order.quoteDeliveryRungTZS ?? 0;
  const total = order.quoteOrderTotalTZS;

  if (goodsRung == null || total == null) return { ok: false, reason: "no-quote" };

  const goodsShare = order.lineTotalTZS - goodsRung;
  const carrierShare = deliveryFee - deliveryRung;
  const feeTZS = goodsRung + deliveryRung;

  if (goodsShare < 0 || carrierShare < 0 || feeTZS < 0) return { ok: false, reason: "bad-quote" };
  if (goodsShare + carrierShare + feeTZS !== total) return { ok: false, reason: "bad-quote" };
  if (total !== capturedTZS) return { ok: false, reason: "amount-mismatch" };

  const courierRoute = order.routeKind === "agent";
  return {
    ok: true,
    split: {
      branchTZS: courierRoute ? goodsShare : goodsShare + carrierShare,
      courierTZS: courierRoute ? carrierShare : 0,
      feeTZS,
    },
  };
}

/** Ledger kinds that leave MalFleks's balance to a partner, and so get batched. */
export const PAYOUT_KINDS = ["branch_payout", "courier_payout"] as const;
/** Every kind written when an order's money is split. */
export const SPLIT_KINDS = ["branch_payout", "courier_payout", "malfleks_fee"] as const;

/**
 * Tanzanian mobile numbers as ClickPesa's payout form wants them: twelve
 * digits starting 255, no plus, no leading zero. `null` when the input is not
 * recognisably one, so the page shows nothing rather than a wrong number.
 */
export function toPayoutPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
  return null;
}
