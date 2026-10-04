import type { DeliveryEta } from "@/data";
import { SHOP } from "@/i18n/copy/shop";
import type { Locale } from "@/i18n/locale";

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
export function formatEta({ minDays, maxDays }: DeliveryEta, locale: Locale = "en"): string {
  const words = SHOP[locale].delivery.eta;
  if (maxDays === 0) return words.sameDay;
  if (minDays === maxDays) return maxDays === 1 ? words.nextDay : words.days(maxDays);
  if (minDays === 0) return words.todayTo(words.days(maxDays));
  return words.range(minDays, maxDays);
}

/**
 * One sentence describing where a branch is, using only what is actually known.
 *
 * Two pages used to build this inline as:
 *
 * ```tsx
 * {branch.name} is at {branch.addressLine}, open {branch.hours}
 * ```
 *
 * That was fine while every branch carried an address and opening hours. Both
 * became optional on 2026-08-31, when the invented ones were removed — and the
 * template above degrades into "Toyota Tanzania — Arusha is at , open ." which
 * is worse than saying nothing, because it looks like a bug rather than a gap.
 *
 * The rule here is that each clause appears only when its fact exists, and the
 * city always does. A branch we know least about still produces a true
 * sentence.
 */
export function describeBranchLocation(
  branch: {
    name: string;
    city: string;
    addressLine?: string;
    hours?: string;
  },
  locale: Locale = "en",
): string {
  const words = SHOP[locale].product;
  const where = branch.addressLine
    ? words.branchAt(branch.name, branch.addressLine)
    : words.branchIn(branch.name, branch.city);
  return branch.hours ? `${where}, ${words.open(branch.hours)}` : where;
}
