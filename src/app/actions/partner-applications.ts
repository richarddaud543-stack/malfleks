"use server";

import { verifySession } from "@/server/auth/dal";
import { isAdminConfigured } from "@/server/firebase/admin-config";
import type { PartnerApplicationInput } from "@/lib/partner-application";

/**
 * A brand branch or a courier applying to join Soko.
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
      reason: "signed-out" | "unavailable" | "rejected" | "quota";
    };

export async function submitPartnerApplication(
  input: PartnerApplicationInput
): Promise<ApplyResult> {
  if (!isAdminConfigured()) return { submitted: false, reason: "unavailable" };

  // uid and email are taken from here and nowhere else. Whatever the payload
  // claims about who is applying, this is the only answer the write path sees.
  const session = await verifySession();
  if (!session) return { submitted: false, reason: "signed-out" };

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

    return { submitted: true };
  } catch {
    // Unlike an order request, there is no browser-side copy to fall back on —
    // if this fails the application does not exist anywhere. Say so, and keep
    // what they typed on screen so they can retry without re-entering it.
    return { submitted: false, reason: "unavailable" };
  }
}
