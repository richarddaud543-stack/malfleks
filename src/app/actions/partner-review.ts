"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/server/auth/dal";
import { isAdminUser } from "@/server/auth/admin";
import { isAdminConfigured } from "@/server/firebase/admin-config";

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

async function requireAdminSession() {
  if (!isAdminConfigured()) return null;
  const session = await verifySession();
  if (!session || !isAdminUser(session)) return null;
  return session;
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

    revalidatePath("/admin");
    return { ok: true };
  } catch {
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
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
