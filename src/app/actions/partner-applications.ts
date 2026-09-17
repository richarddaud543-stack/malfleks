"use server";

import { verifySession } from "@/server/auth/dal";
import { isAuthConfigured } from "@/server/auth/config";
import { checkRateLimit } from "@/server/rate-limit";
import { logServerError } from "@/server/error-log";
import type { PartnerApplicationInput } from "@/lib/partner-application";

// A handful a day is generous for a genuine applicant (one brand, maybe a
// correction re-submit) and still closes off scripted spam of the review
// queue and the notification inbox behind it.
const APPLICATION_RATE_LIMIT = {
  action: "partner-application",
  limit: 5,
  windowMs: 24 * 60 * 60_000,
};

/**
 * A brand branch or a courier applying to join MalFleks.
 *
 * Sign-in is required, and not mainly for spam. **The account that applies is
 * the account that gets the partner role**, so on approval an admin grants a
 * role to a uid that already exists rather than creating a login for someone
 * they have never met. The applicant's identity is therefore provable at the
 * moment they apply, which is the whole reason the pipeline in
 * `docs/marketplace-model.md` can say "admin approves them" and mean something.
 *
 * The form checks the session first for the customer's sake; this checks it
 * again because a client check is a courtesy, not a control.
 */

export type ApplyResult =
  | { submitted: true }
  | {
      submitted: false;
      reason: "signed-out" | "unavailable" | "rejected" | "quota" | "rate-limited";
    };

export async function submitPartnerApplication(
  input: PartnerApplicationInput
): Promise<ApplyResult> {
  if (!isAuthConfigured()) return { submitted: false, reason: "unavailable" };

  // uid and email are taken from here and nowhere else. Whatever the payload
  // claims about who is applying, this is the only answer the write path sees.
  const session = await verifySession();
  if (!session) return { submitted: false, reason: "signed-out" };

  const limit = await checkRateLimit(session.uid, APPLICATION_RATE_LIMIT);
  if (!limit.allowed) return { submitted: false, reason: "rate-limited" };

  try {
    // Dynamic: this module reaches the database, so it is only worth loading
    // once someone actually submits.
    const { createApplicationForUser } = await import(
      "@/server/partners/applications"
    );
    const outcome = await createApplicationForUser(
      session.uid,
      session.email ?? "",
      input
    );

    if (!outcome.submitted) {
      return {
        submitted: false,
        reason: outcome.reason === "quota" ? "quota" : "rejected",
      };
    }

    // Tell a human. Deliberately after the write and deliberately ignored:
    // the application exists whether or not this email leaves, and an
    // applicant must never see a failure because a mail API was down.
    await notifyOfApplication(input);

    return { submitted: true };
  } catch (error) {
    // Unlike an order request, there is no browser-side copy to fall back on —
    // if this fails the application does not exist anywhere. Say so, and keep
    // what they typed on screen so they can retry without re-entering it.
    await logServerError("submit-partner-application", error, session.uid);
    return { submitted: false, reason: "unavailable" };
  }
}

/**
 * Announce a new application to MalFleks's own inbox.
 *
 * Its own function, wrapped in its own try/catch, for one reason: it is called
 * from inside the `try` that decides whether the applicant sees success, and
 * nothing it does may reach that catch. `sendNotification` already swallows
 * its own failures; this is the second belt, because a future edit to that
 * module must not be able to turn a delivered application into an error
 * message on a shopkeeper's screen.
 */
async function notifyOfApplication(input: PartnerApplicationInput): Promise<void> {
  try {
    const { partnerApplicationMessage, sendNotification } = await import(
      "@/server/notify/email"
    );
    const { resolveSiteUrl } = await import("@/lib/site-url");
    const { subject, body } = partnerApplicationMessage({
      kind: input.kind,
      businessName: input.businessName.trim(),
      city: input.city,
      siteUrl: resolveSiteUrl(),
    });
    await sendNotification(subject, body);
  } catch (error) {
    // Nothing to do and nobody to tell. The application is already saved —
    // but the same Brevo-outage question `notifyOfOrder` logs applies here.
    await logServerError("notify-of-application", error);
  }
}
