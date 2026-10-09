import {
  DELIVERY_CITIES,
  FeeQuoteError,
  quoteOrder,
  type CityFeeTable,
  type DeliveryCity,
  type DeliveryMode,
  type Quote,
} from "@/lib/fees";
import type { OrderRequest } from "@/lib/order";

/**
 * The money snapshot for one order, or `null` when an honest quote cannot be
 * produced.
 *
 * This is the "Phase 1" wiring `malfleks-business-cycle.md` and
 * `malfleks-payment-integration.md` describe: snapshotting `src/lib/fees`'s
 * quote onto the order the moment it is created, with no payment provider
 * involved at all. It returns `null` rather than throwing, because an
 * unquotable order — an agent route into a city with no delivery fee set,
 * true for every city as of 2026-09-17, see `src/lib/fees/tables.ts` — is not
 * a broken order. It is one MalFleks cannot yet honestly say a fee for, and
 * `createOrder` must keep succeeding exactly as it does today. Once the owner
 * sets a city's fee, orders into that city start getting a real quote with no
 * further code change.
 *
 * `deliveryMode` is the shop's own answer about who pays for delivery, read
 * from its `Partner` row by the caller. Omitted means `DEFAULT_DELIVERY_MODE`,
 * which prices the order exactly as it was priced before that question existed.
 *
 * `fees` defaults to the live table and exists so tests can exercise the
 * computable branch without waiting on the owner's numbers — the same
 * trust-boundary pattern `quoteOrder` itself documents. **Production callers
 * pass one argument.**
 */
export function quoteForOrder(
  order: Pick<OrderRequest, "lineTotalTZS" | "route" | "branch">,
  deliveryMode?: DeliveryMode,
  fees?: CityFeeTable
): Quote | null {
  if (!isDeliveryCity(order.branch.city)) return null;

  try {
    return quoteOrder(
      {
        goodsTotalTZS: order.lineTotalTZS,
        city: order.branch.city,
        routeKind: order.route.kind,
        deliveryMode,
      },
      fees
    );
  } catch (error) {
    if (error instanceof FeeQuoteError) return null;
    throw error;
  }
}

function isDeliveryCity(city: string): city is DeliveryCity {
  return (DELIVERY_CITIES as readonly string[]).includes(city);
}
