"use server";

import { revalidatePath } from "next/cache";
import { adminSession } from "@/server/auth/admin-session";
import { logServerError } from "@/server/error-log";

/**
 * Approving and rejecting partner applications.
 *
 * **These actions check admin themselves.** A Server Action is a public HTTP
 * endpoint — the page that renders the button is not a gate, and anyone who
 * knows an action id can call it directly. The `requireAdmin()` guarding
 * `/admin` protects the page; this protects the operation, and the two are
 * genuinely separate defences rather than one written twice.
 *
 * The failure vocabulary is deliberately identical for "not an admin" and "no
 * such application": neither tells a caller anything about whether an
 * application id exists.
 */

export type ReviewResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "unavailable"
        | "not-found"
        | "already-reviewed"
        | "account-already-partnered"
        | "reason-required";
    };

/**
 * A rejection is emailed to the applicant with its reason, so a blank one is
 * refused here as well as in the form: a Server Action can be called without
 * the form, and "we could not approve this" with no why is an email that
 * generates a phone call.
 */
const MIN_REASON_LENGTH = 3;

// One shared guard: auth configured, right hostname, session, admin.
// See server/auth/admin-session.ts for why it lives in one place now.
const requireAdminSession = adminSession;

export type ViewDocumentResult =
  | { ok: true; url: string }
  | { ok: false; reason: "forbidden" | "not-found" | "unavailable" };

/**
 * A short-lived link to one uploaded document, for an admin to open.
 *
 * Fetched on click rather than rendered into the queue page. A signed URL baked
 * into server-rendered HTML is a trading licence sitting in a browser cache and
 * in every proxy log on the way; one minted when the admin presses "Open" and
 * dead five minutes later is not. The link is also never returned for an
 * application nobody asked about, so a leaked page source carries no URLs at
 * all.
 */
export async function viewApplicationDocument(
  documentId: string
): Promise<ViewDocumentResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { getPrisma } = await import("@/server/db/client");
    const document = await getPrisma().partnerDocument.findUnique({
      where: { id: documentId },
      select: { storagePath: true },
    });
    if (!document) return { ok: false, reason: "not-found" };

    const { signedDocumentUrl } = await import("@/server/partners/documents");
    const url = await signedDocumentUrl(document.storagePath);
    // Null here almost always means the bucket's select policy does not allow
    // MalFleks's own admin accounts -- see the bucket note in that module.
    if (!url) return { ok: false, reason: "unavailable" };
    return { ok: true, url };
  } catch (error) {
    await logServerError("view-application-document", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

export async function approvePartnerApplication(
  applicationId: string
): Promise<ReviewResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { approveApplication } = await import("@/server/partners/review");
    const outcome = await approveApplication(applicationId, session.uid);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // After the commit, and only for the call that actually decided it: a
    // second approve returns `already-reviewed` above and never reaches here.
    const { notifyApplicationDecision } = await import("@/server/notify/events");
    await notifyApplicationDecision(applicationId);

    revalidatePath("/admin");
    revalidatePath("/admin/applications");
    return { ok: true };
  } catch (error) {
    await logServerError("approve-partner-application", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

export async function rejectPartnerApplication(
  applicationId: string,
  note: string
): Promise<ReviewResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  const reason = typeof note === "string" ? note.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, reason: "reason-required" };

  try {
    const { rejectApplication } = await import("@/server/partners/review");
    const outcome = await rejectApplication(applicationId, session.uid, reason);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    const { notifyApplicationDecision } = await import("@/server/notify/events");
    await notifyApplicationDecision(applicationId);

    revalidatePath("/admin");
    revalidatePath("/admin/applications");
    return { ok: true };
  } catch (error) {
    await logServerError("reject-partner-application", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
