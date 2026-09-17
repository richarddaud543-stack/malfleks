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
        | "account-already-partnered";
    };

// One shared guard: auth configured, right hostname, session, admin.
// See server/auth/admin-session.ts for why it lives in one place now.
const requireAdminSession = adminSession;

export async function approvePartnerApplication(
  applicationId: string
): Promise<ReviewResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { approveApplication } = await import("@/server/partners/review");
    const outcome = await approveApplication(applicationId, session.uid);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidatePath("/admin");
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

  try {
    const { rejectApplication } = await import("@/server/partners/review");
    const outcome = await rejectApplication(applicationId, session.uid, note);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    await logServerError("reject-partner-application", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
