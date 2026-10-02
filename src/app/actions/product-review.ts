"use server";

import { revalidatePath } from "next/cache";

import { adminSession } from "@/server/auth/admin-session";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";
import { logServerError } from "@/server/error-log";

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
        | "slug-taken"
        | "reason-required";
    };

/**
 * A product sent back is emailed to the partner with the reason, and the
 * reason is the only thing that stops them resubmitting the identical
 * product. Required here as well as in the form, because a Server Action can
 * be called without the form.
 */
const MIN_REASON_LENGTH = 3;

// One shared guard: auth configured, right hostname, session, admin.
// See server/auth/admin-session.ts for why it lives in one place now.
const requireAdminSession = adminSession;

/**
 * A published product appears on the home rail, the brand page, the branch
 * page, search and the locator counts, and its own page is generated from
 * `generateStaticParams`. Revalidating one path and not the others is how a
 * product ends up visible in search and 404 on its own URL.
 */
async function revalidateCatalogue() {
  revalidatePath("/admin/submissions");
  revalidatePath("/");
  revalidatePath("/brands", "layout");
  revalidatePath("/search");
  revalidatePath("/locator");
  revalidatePath("/products", "layout");
  revalidatePath("/delivery", "layout");
  revalidatePath("/partner");
  // The calls above only clear this (admin) deployment's own cache. This is
  // the one that actually reaches the shop customers browse — see the module
  // doc on notifyPublicSiteOfCatalogueChange for why both are needed.
  await notifyPublicSiteOfCatalogueChange();
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

    // Published, by this call: tell the partner it is on sale. Sent from here
    // rather than from `submissions.ts` so the write stays a write. Never
    // throws, and a second publish returns `already-reviewed` above.
    const { notifyProductDecision } = await import("@/server/notify/events");
    await notifyProductDecision(submissionId);

    await revalidateCatalogue();
    return { ok: true };
  } catch (error) {
    await logServerError("publish-product-submission", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

export async function rejectProductSubmission(
  submissionId: string,
  note: string,
): Promise<ProductReviewResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  const reason = typeof note === "string" ? note.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, reason: "reason-required" };

  try {
    const { rejectSubmission } = await import("@/server/partners/submissions");
    const outcome = await rejectSubmission(submissionId, session.uid, reason);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    const { notifyProductDecision } = await import("@/server/notify/events");
    await notifyProductDecision(submissionId);

    // Nothing customer-facing changed, but the partner's own page shows the
    // decision and the reason — that is the whole point of writing one.
    revalidatePath("/admin/submissions");
    revalidatePath("/partner");
    return { ok: true };
  } catch (error) {
    await logServerError("reject-product-submission", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
