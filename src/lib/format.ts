import type { DeliveryEta } from "@/data";

export function formatTZS(amount: number): string {
  return new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * The customer-facing label for a courier's `eta`. This is the only place a
 * day count becomes words, so "Same-day" reads identically on a search card,
 * the agent picker and a saved order request.
 *
 * Day 0 is today and day 1 is tomorrow, so a 1–1 quote is "Next day" rather
 * than the literal "1 day" — the range is inclusive of both ends, and "1 day"
 * invites the reading "within 24 hours", which is a different promise.
 *
 * The separator is an en dash (U+2013), matching the numeric ranges already
 * used across the price bands.
 */
export function formatEta({ minDays, maxDays }: DeliveryEta): string {
  const day = (n: number) => (n === 1 ? "1 day" : `${n} days`);

  if (maxDays === 0) return "Same-day";
  if (minDays === maxDays) return maxDays === 1 ? "Next day" : day(maxDays);
  // A 0–n quote is a courier that *might* manage today but will not commit to
  // it. Saying "Same-day" there would promise the best case as if it were the
  // only case.
  if (minDays === 0) return `Today – ${day(maxDays)}`;
  return `${minDays}–${maxDays} days`;
}
