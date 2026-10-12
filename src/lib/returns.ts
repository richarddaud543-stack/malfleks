/**
 * The customer's right to change their mind after delivery.
 *
 * Tanzania's Electronic Transactions Act, 2015, s.30: a consumer may cancel
 * within seven days of receiving goods, provided they have had no material
 * benefit from them; they pay only the direct cost of returning them; and
 * anything paid is refunded within thirty days of the cancellation. It does
 * not apply to foodstuffs, beverages and other goods for daily consumption
 * (s.30(5)) -- which this site cannot tell from a category name alone, so a
 * person at MalFleks decides that when the request arrives, and the Terms say
 * so.
 *
 * Pure: no clock beyond what is passed in, so the edges are testable.
 */

/** Days after delivery during which "Return this order" is offered. */
export const RETURN_WINDOW_DAYS = 7;

/** Days after the customer cancels by which the refund must have been made. */
export const REFUND_WITHIN_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;

/**
 * Whether an order delivered at `deliveredAt` may still be returned at `now`.
 *
 * Counted in whole elapsed time, not calendar days: delivered at 18:00 on the
 * 1st, the window closes at 18:00 on the 8th. That is never shorter than the
 * law's seven days, whatever time of day the delivery happened.
 */
export function returnWindowOpen(deliveredAt: Date | string | null | undefined, now: number = Date.now()): boolean {
  if (!deliveredAt) return false;
  const at = typeof deliveredAt === "string" ? Date.parse(deliveredAt) : deliveredAt.getTime();
  if (Number.isNaN(at)) return false;
  return now >= at && now - at <= RETURN_WINDOW_DAYS * DAY_MS;
}

/** When the window closes, for telling the customer and the owner. */
export function returnWindowClosesAt(deliveredAt: Date | string): Date {
  const at = typeof deliveredAt === "string" ? Date.parse(deliveredAt) : deliveredAt.getTime();
  return new Date(at + RETURN_WINDOW_DAYS * DAY_MS);
}
