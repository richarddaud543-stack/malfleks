/**
 * Someone telling MalFleks that a listing is wrong -- the rules, kept pure so
 * the form and the server hold a report to the same standard.
 *
 * Why this exists: partners upload their own product photos and words, and a
 * marketplace that publishes what others upload needs a way for a rights
 * holder to say "that photo is mine" and see it taken down, and a record that
 * it was asked. Until 12 Oct 2026 the only route was an email address at the
 * bottom of the Terms. Reports go to the owner as an alert (stored, emailed,
 * and listed in the console until dealt with); see `reportListing`.
 *
 * The reasons are the ones a customer or a rights holder would recognise, not
 * legal categories. "rights" covers a copied photo, a brand used without
 * permission and copied text alike: the owner reads the details either way.
 */

export const REPORT_REASONS = ["rights", "fake", "unsafe", "wrong", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MIN = 10;
export const REPORT_DETAILS_MAX = 1500;

export interface ListingReportInput {
  productId: string;
  reason: string;
  details: string;
}

export type ListingReportField = "reason" | "details";

export type ListingReportValidation =
  | { ok: true; value: { productId: string; reason: ReportReason; details: string } }
  | { ok: false; errors: Partial<Record<ListingReportField, "missing" | "too-short" | "too-long">> };

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

export function validateListingReport(input: ListingReportInput): ListingReportValidation {
  const errors: Partial<Record<ListingReportField, "missing" | "too-short" | "too-long">> = {};
  if (!isReportReason(input.reason)) errors.reason = "missing";

  // Collapse runs of blank lines and trailing space, keep the words.
  const details = String(input.details ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (details.length === 0) errors.details = "missing";
  else if (details.length < REPORT_DETAILS_MIN) errors.details = "too-short";
  else if (details.length > REPORT_DETAILS_MAX) errors.details = "too-long";

  const productId = String(input.productId ?? "").trim();
  if (Object.keys(errors).length > 0 || !productId || !isReportReason(input.reason)) {
    return { ok: false, errors };
  }
  return { ok: true, value: { productId, reason: input.reason, details } };
}

/** The reason in plain English, for the owner's alert. */
export const REPORT_REASON_FOR_OWNER: Record<ReportReason, string> = {
  rights: "Uses someone's photo, brand or work without permission",
  fake: "Fake or counterfeit",
  unsafe: "Unsafe or not allowed to be sold",
  wrong: "Wrong price, details or location",
  other: "Something else",
};
