"use server";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import { checkRateLimit } from "@/server/rate-limit";
import { REPORT_REASON_FOR_OWNER, validateListingReport, type ListingReportInput } from "@/lib/listing-report";
import type { ReportFailure } from "@/i18n/copy/report";

/**
 * "Report this listing" -- a rights holder, or any customer, telling MalFleks
 * that a listing is wrong: a copied photo, a brand used without permission, a
 * fake, something unsafe, a wrong price.
 *
 * Signed in only. A report reaches the owner's inbox and phone-sized console,
 * and an open form that anybody could post to would be a way to flood both --
 * or to have a competitor's listings hidden. The Terms and the page both give
 * the email route for anyone who cannot sign in.
 *
 * A report becomes an owner alert (`raiseAlert`): stored, emailed once, and
 * listed in the console with "I'm handling this" and "Done" until it is dealt
 * with. Its key is the listing and the reporter, so one person reporting the
 * same listing twice raises one alert; a different person reporting it raises
 * their own, which is itself information.
 *
 * Nothing is hidden automatically. A report is a claim, and taking a listing
 * down on an unverified claim is exactly the misuse the sign-in requirement is
 * there to make harder. The alert says how to hide it.
 */

/** Five a day per account: generous for a real person, useless for a flood. */
const REPORT_RATE_LIMIT = { action: "report-listing", limit: 5, windowMs: 24 * 60 * 60_000 };

export type ReportListingResult = { ok: true } | { ok: false; reason: ReportFailure };

export async function reportListing(input: ListingReportInput): Promise<ReportListingResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  // `verifySession` turns an unreachable auth server into "signed out", but
  // reading the cookies happens before its own guard: held here too.
  let session: Awaited<ReturnType<typeof verifySession>>;
  try {
    session = await verifySession();
  } catch (error) {
    await logServerError("report-listing", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!session) return { ok: false, reason: "signed-out" };

  const validated = validateListingReport({
    productId: String(input?.productId ?? ""),
    reason: String(input?.reason ?? ""),
    details: String(input?.details ?? ""),
  });
  if (!validated.ok) return { ok: false, reason: "invalid" };
  const report = validated.value;

  try {
    const { getBranchById, getBrandById, getProductById } = await import("@/server/repositories");
    const product = await getProductById(report.productId);
    if (!product) return { ok: false, reason: "not-found" };

    const limit = await checkRateLimit(session.uid, REPORT_RATE_LIMIT);
    if (!limit.allowed) return { ok: false, reason: "rate-limited" };

    const [brand, branch] = await Promise.all([getBrandById(product.brandId), getBranchById(product.branchId)]);
    const where = [brand?.name, branch?.name].filter(Boolean).join(", ");

    const { raiseAlert } = await import("@/server/rules/alerts");
    const raised = await raiseAlert({
      key: "listing-report",
      subjectId: `${product.id}:${session.uid}`,
      urgency: "routine",
      subject: `Listing reported: ${product.name}${where ? ` (${where})` : ""}`.slice(0, 200),
      body: [
        `Someone has reported a listing on MalFleks.`,
        "",
        `Listing: ${product.name}${where ? `, ${where}` : ""} (product id ${product.id})`,
        `Reason: ${REPORT_REASON_FOR_OWNER[report.reason]}`,
        `From: ${session.email ?? "a signed-in customer with no email on the account"}`,
        "",
        "What they wrote:",
        report.details,
        "",
        "To take it down while you check: Catalogue, find the product, Hide. Reply to the reporter when you have decided.",
        "If it is someone else's photo or work, remove it and tell the partner why; a partner who does it again is removed (Terms, \"Reporting a listing\").",
      ].join("\n"),
      href: "/admin/catalogue",
      data: { productId: product.id, reason: report.reason, reporterUid: session.uid, reporterEmail: session.email ?? null },
    });
    if (!raised.raised) return { ok: false, reason: "already-reported" };
    return { ok: true };
  } catch (error) {
    await logServerError("report-listing", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
