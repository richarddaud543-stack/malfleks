"use server";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import { checkRateLimit } from "@/server/rate-limit";
import type { UploadedDocument } from "@/server/partners/documents";

/**
 * Attaching a shop's uploaded documents to its application, and asking the AI
 * reader to look at them.
 *
 * ## Why this is a second step
 *
 * A document's storage path contains the application's id
 * (`<uid>/<applicationId>/<kind>-<stamp>.<ext>`), so the application has to
 * exist before a file can be put anywhere sensible. The form therefore submits
 * the application, gets its id back, uploads the three files from the browser,
 * and then calls this.
 *
 * The cost of that order is that an application can briefly exist with no
 * documents — if the upload fails, or the applicant closes the tab. That is a
 * state the admin queue shows plainly ("documents missing") and the applicant
 * can finish later, which is better than the alternative: a scheme that
 * uploads to a made-up draft id and leaves orphaned licences in a bucket
 * nobody is looking at.
 *
 * ## The trust boundary
 *
 * The browser hands over paths and signed URLs. Neither is believed:
 * `recordApplicationDocuments` re-checks that every path sits under this
 * caller's own uid and that the application is this caller's own. The signed
 * URL is used once, to read the bytes, and never stored.
 *
 * The screening costs money per call, so it is rate-limited per account the
 * same way the listing helpers are.
 */

const ATTACH_LIMIT = {
  action: "partner-documents",
  limit: 15,
  windowMs: 24 * 60 * 60_000,
};

export type AttachResult =
  | {
      attached: true;
      recorded: number;
      /** What the reader made of them, or why it did not run. Advisory, never a decision. */
      screening:
        | { ran: true; verdict: string }
        | { ran: false; reason: "not-configured" | "nothing-to-read" | "provider-failed" };
    }
  | {
      attached: false;
      reason:
        | "signed-out"
        | "unavailable"
        | "not-yours"
        | "no-application"
        | "bad-document"
        | "rate-limited";
    };

export async function attachApplicationDocuments(
  applicationId: string,
  documents: UploadedDocument[],
): Promise<AttachResult> {
  if (!isAuthConfigured()) return { attached: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { attached: false, reason: "signed-out" };

  const limit = await checkRateLimit(session.uid, ATTACH_LIMIT);
  if (!limit.allowed) return { attached: false, reason: "rate-limited" };

  try {
    const { recordApplicationDocuments, screenApplicationDocuments } = await import(
      "@/server/partners/documents"
    );

    const recorded = await recordApplicationDocuments(session.uid, applicationId, documents);
    if (!recorded.ok) return { attached: false, reason: recorded.reason };

    // Deliberately after the write and deliberately not allowed to fail it: the
    // documents are attached whether or not a model was reachable, and an
    // applicant must never see an error because Google was down. The admin sees
    // "not screened" and reads them himself, which is what happened before this
    // existed.
    const screened = await screenApplicationDocuments(applicationId, documents);

    // A shop already on MalFleks sending documents from its partner page: the
    // owner is told they are waiting to be read. Does nothing for an
    // application still being reviewed -- the review queue shows those.
    const { tellOwnerDocumentsArrived } = await import("@/server/partners/verification");
    await tellOwnerDocumentsArrived(applicationId);

    return {
      attached: true,
      recorded: recorded.recorded,
      screening: screened.ok
        ? { ran: true, verdict: screened.verdict }
        : { ran: false, reason: screened.reason },
    };
  } catch (error) {
    await logServerError("attach-application-documents", error, session.uid);
    return { attached: false, reason: "unavailable" };
  }
}
