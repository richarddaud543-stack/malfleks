"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { isAdminUser } from "@/server/auth/admin";
import { verifySession } from "@/server/auth/dal";

/**
 * Publishing or turning down a product a partner submitted — admin only.
 *
 * `publishSubmission` and `rejectSubmission` have existed in
 * `src/server/partners/submissions.ts` since the submission flow was built,
 * complete with a race-safe `updateMany` guard and its own integration tests.
 * **Nothing called them.** A partner could fill in the form, the row landed in
 * the database, and there was no screen anywhere that could turn it into a
 * product. This file and `/admin/submissions` are the missing half.
 *
 * Publishing writes a customer-facing `Product`, so admin is re-checked here:
 * a Server Action is a public HTTP endpoint and the page is not its gate.
 */

export type ProductReviewResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "unavailable"
        | "not-found"
        | "already-reviewed"
        | "no-branch"
        | "slug-taken";
    };

async function requireAdminSession() {
  if (!isAuthConfigured()) return null;
  const session = await verifySession();
  if (!session || !isAdminUser(session)) return null;
  return session;
}

/**
 * A published product appears on the home rail, the brand page, the branch
 * page, search and the locator counts, and its own page is generated from
 * `generateStaticParams`. Revalidating one path and not the others is how a
 * product ends up visible in search and 404 on its own URL.
 */
function revalidateCatalogue() {
  revalidatePath("/admin/submissions");
  revalidatePath("/");
  revalidatePath("/brands", "layout");
  revalidatePath("/search");
  revalidatePath("/locator");
  revalidatePath("/products", "layout");
  revalidatePath("/delivery", "layout");
  revalidatePath("/partner");
}

export async function publishProductSubmission(
  submissionId: string,
): Promise<ProductReviewResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { publishSubmission } = await import("@/server/partners/submissions");
    const outcome = await publishSubmission(submissionId, session.uid);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    revalidateCatalogue();
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function rejectProductSubmission(
  submissionId: string,
  note: string,
): Promise<ProductReviewResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { rejectSubmission } = await import("@/server/partners/submissions");
    const outcome = await rejectSubmission(submissionId, session.uid, note);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // Nothing customer-facing changed, but the partner's own page shows the
    // decision and the reason — that is the whole point of writing one.
    revalidatePath("/admin/submissions");
    revalidatePath("/partner");
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
