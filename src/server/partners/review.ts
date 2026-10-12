import { getPrisma } from "@/server/db/client";
import { missingDocumentKinds } from "@/lib/partner-document";

/**
 * Reviewing partner applications — the admin half of the pipeline.
 *
 * Split the same way the rest of `src/server` is: the *decision* is pure and
 * exhaustively tested, the write is a thin transaction over it. Approving is
 * the one irreversible-ish step in the whole flow, so the question "may this be
 * approved?" is worth answering somewhere a test can reach without a database.
 */

/** What an admin sees in the queue. Trimmed to what the page renders. */
export interface ReviewableApplication {
  id: string;
  kind: string;
  status: string;
  uid: string;
  email: string;
  businessName: string;
  contactName: string;
  phone: string;
  city: string;
  brandId: string | null;
  brandOther: string | null;
  address: string | null;
  deliveryMode: string | null;
  notes: string | null;
  aiVerdict: string | null;
  aiNotes: string | null;
  createdAt: string;
  aiCheckedAt: string | null;
  reviewedAt: string | null;
  decisionNote: string | null;
  /** The uploaded paperwork, newest first, with the reader's line on each. */
  documents: ReviewableDocument[];
}

/** One uploaded document as the admin queue shows it. Never the bytes. */
export interface ReviewableDocument {
  id: string;
  kind: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
  aiVerdict: string | null;
  aiNotes: string | null;
}

export type ApproveBlocker =
  | "not-found"
  | "already-reviewed"
  | "account-already-partnered";

export type ApproveCheck =
  | { ok: true }
  | { ok: false; reason: ApproveBlocker };

/**
 * Whether an application may be approved — pure, so both directions are cheap
 * to test.
 *
 * `alreadyPartnered` is whether this application's uid already manages some
 * partner. `PartnerUser.uid` is a primary key, so approving anyway would throw
 * a constraint violation from deep inside Prisma; catching it here means the
 * admin reads "this account already manages a partner" instead of a stack
 * trace, and means the rule is stated in one place rather than implied by a
 * unique index.
 */
export function canApprove(
  application: { status: string } | null,
  alreadyPartnered: boolean
): ApproveCheck {
  if (!application) return { ok: false, reason: "not-found" };
  if (application.status !== "pending") {
    return { ok: false, reason: "already-reviewed" };
  }
  if (alreadyPartnered) {
    return { ok: false, reason: "account-already-partnered" };
  }
  return { ok: true };
}

function serialise(row: {
  id: string;
  kind: string;
  status: string;
  uid: string;
  email: string;
  businessName: string;
  contactName: string;
  phone: string;
  city: string;
  brandId: string | null;
  brandOther: string | null;
  address: string | null;
  deliveryMode: string | null;
  notes: string | null;
  aiVerdict: string | null;
  aiNotes: string | null;
  createdAt: Date;
  aiCheckedAt: Date | null;
  reviewedAt: Date | null;
  decisionNote: string | null;
  documents?: {
    id: string;
    kind: string;
    storagePath: string;
    mimeType: string;
    byteSize: number;
    uploadedAt: Date;
    aiVerdict: string | null;
    aiNotes: string | null;
  }[];
}): ReviewableApplication {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    aiCheckedAt: row.aiCheckedAt ? row.aiCheckedAt.toISOString() : null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    documents: (row.documents ?? []).map((document) => ({
      ...document,
      uploadedAt: document.uploadedAt.toISOString(),
    })),
  };
}

/** Pending first, oldest first — the order they should be worked in. */
export async function listPendingApplications(): Promise<ReviewableApplication[]> {
  const rows = await getPrisma().partnerApplication.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { documents: { orderBy: { uploadedAt: "desc" } } },
  });
  return rows.map(serialise);
}

/** The recent decisions, so an admin can see what they just did and undo-by-eye. */
export async function listReviewedApplications(
  limit = 20
): Promise<ReviewableApplication[]> {
  const rows = await getPrisma().partnerApplication.findMany({
    where: { status: { not: "pending" } },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    include: { documents: { orderBy: { uploadedAt: "desc" } } },
  });
  return rows.map(serialise);
}

export type ReviewOutcome =
  | { ok: true }
  | { ok: false; reason: ApproveBlocker };

/**
 * Approves one application: creates the `Partner`, binds the applicant's
 * account to it, and stamps the application reviewed — **all three or none**.
 *
 * In one transaction because a `Partner` with no `PartnerUser` is a partner
 * nobody can sign in as, and an application marked approved with no `Partner`
 * behind it is worse: it looks done and is not.
 *
 * Note what this deliberately does *not* do: it creates no `Branch` and no
 * `DeliveryAgent`, so nothing appears to a customer. Wiring an approved partner
 * into the catalogue is a separate, deliberate act, because a `Branch` row is
 * customer-facing data governed by the `verified` flag rule.
 */
/** Thrown inside the transaction to roll it back. Never escapes this module. */
class LostTheRace extends Error {}

/** Prisma's unique-constraint violation, duck-typed so no error class import. */
function uniqueViolationOn(error: unknown): string[] | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== "P2002") return null;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.map(String) : [];
}

export async function approveApplication(
  applicationId: string,
  adminUid: string
): Promise<ReviewOutcome> {
  const db = getPrisma();

  const application = await db.partnerApplication.findUnique({
    where: { id: applicationId },
  });
  const alreadyPartnered = application
    ? (await db.partnerUser.count({ where: { uid: application.uid } })) > 0
    : false;

  // This pre-check exists for the *message*, not the safety. It reads the row
  // and reports precisely why an approval cannot proceed. The guarantees are
  // enforced below, inside the transaction, because everything read here is
  // already stale by the time the write runs.
  const check = canApprove(application, alreadyPartnered);
  if (!check.ok || !application) return check.ok ? { ok: true } : check;

  // A shop that applied with all three documents was verified by the person
  // approving it: approving is reading them. See `verification.ts`.
  const verifiedNow =
    application.kind === "brand" &&
    missingDocumentKinds(await db.partnerDocument.findMany({ where: { applicationId: application.id }, select: { kind: true } })).length === 0;

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const partner = await tx.partner.create({
        data: {
          kind: application.kind,
          displayName: application.businessName,
          contactName: application.contactName,
          phone: application.phone,
          city: application.city,
          brandId: application.brandId,
          address: application.address,
          // The shop's own answer about who pays for delivery, carried over so
          // its orders are priced the way it agreed. A courier application has
          // none, and an application filed before 6 Oct 2026 has none either --
          // both fall back to the column's default, "customer_pays".
          ...(application.deliveryMode ? { deliveryMode: application.deliveryMode } : {}),
          applicationId: application.id,
          approvedBy: adminUid,
          ...(verifiedNow ? { documentsVerifiedAt: now, documentsVerifiedBy: adminUid } : {}),
        },
        select: { id: true },
      });

      await tx.partnerUser.create({
        data: { uid: application.uid, partnerId: partner.id },
      });

      // `updateMany` with the status in the WHERE, not `update` by id.
      //
      // The difference is the whole finding: `update` would happily overwrite a
      // decision another admin made between our read and this write. Two
      // admins on the same row — one rejecting, one approving — both passed the
      // pre-check above, and the loser used to win anyway, leaving an
      // application marked "rejected" while the applicant held a working
      // partner account. Making the status part of the WHERE means the second
      // writer matches zero rows and we roll the whole thing back.
      const { count } = await tx.partnerApplication.updateMany({
        where: { id: application.id, status: "pending" },
        data: {
          status: "approved",
          reviewedAt: now,
          reviewedBy: adminUid,
        },
      });
      if (count === 0) throw new LostTheRace();
    });
  } catch (error) {
    if (error instanceof LostTheRace) {
      return { ok: false, reason: "already-reviewed" };
    }
    // The unique constraints are the second line of defence, and they fire when
    // two approvals race past the pre-check together. Translating them here is
    // what stops the admin seeing a generic "unavailable" for a situation we
    // understand exactly.
    const target = uniqueViolationOn(error);
    if (target) {
      return {
        ok: false,
        reason: target.some((column) => column.includes("applicationId"))
          ? "already-reviewed"
          : "account-already-partnered",
      };
    }
    throw error;
  }

  return { ok: true };
}

/**
 * Rejects one application. No `Partner`, and the reason is stored — a decision
 * nobody wrote down becomes folklore, and the applicant may well ask.
 */
export async function rejectApplication(
  applicationId: string,
  adminUid: string,
  note: string
): Promise<ReviewOutcome> {
  const db = getPrisma();

  // Same reasoning as the approve path: the status goes in the WHERE so a
  // decision that landed a moment ago cannot be silently overwritten. The
  // affected-row count is the answer, not the earlier read.
  const { count } = await db.partnerApplication.updateMany({
    where: { id: applicationId, status: "pending" },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: adminUid,
      decisionNote: note.trim() === "" ? null : note.trim(),
    },
  });

  if (count === 0) {
    // Nothing matched: either there is no such application, or somebody else
    // already decided it. Distinguish them for the admin's message — this read
    // cannot race anything, because either way the row is no longer pending.
    const exists = await db.partnerApplication.count({
      where: { id: applicationId },
    });
    return { ok: false, reason: exists > 0 ? "already-reviewed" : "not-found" };
  }

  return { ok: true };
}
