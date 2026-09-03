import { getPrisma } from "@/server/db/client";

/**
 * Where one signed-in account stands with MalFleks: not applied, waiting,
 * turned down, or already a partner.
 *
 * This exists because `/apply` had no idea. It showed the same blank
 * "Become a partner" form to a first-time visitor, to someone whose
 * application was sitting in the review queue, and to a partner who had
 * already been approved and put on the map. All three saw "You apply → we
 * check it by hand → you're set up" and a form, with nothing acknowledging
 * what they had already done.
 *
 * The quota in `applications.ts` allows **five** pending applications per
 * account, so this was not a wall anyone hit quickly. A shop that applied,
 * heard nothing — nothing emails an applicant on approval — and came back a
 * week later would simply apply again, and again, each one landing as a
 * separate row in the owner's queue for the same business.
 *
 * Only ever called for the *current* session's uid. It returns a person's own
 * standing and nobody else's; there is no lookup by anything a caller supplies.
 */

export type PartnerStatus =
  /** No application on this account. Show the form. */
  | { state: "none" }
  /** An application is in the queue. Show it, not a fresh form. */
  | { state: "pending"; submittedAt: string }
  /** Reviewed and declined. They may apply again — the quota counts only pending rows. */
  | { state: "rejected"; reviewedAt: string | null }
  /**
   * Approved, with an account. `live` distinguishes the two halves of the
   * pipeline: a partner is `live: false` between approval and the separate
   * "Put on the map" step, and until that happens they cannot publish a single
   * product. Saying so is the difference between a partner who waits patiently
   * and one who thinks the site is broken.
   */
  | { state: "partner"; live: boolean; kind: string };

export async function partnerStatusForUser(uid: string): Promise<PartnerStatus> {
  const db = getPrisma();

  // An account is checked first: approval creates a PartnerUser, so this is
  // the strongest statement about where someone stands, and it outranks any
  // application row still lying around from before.
  const membership = await db.partnerUser.findUnique({
    where: { uid },
    select: {
      partner: { select: { kind: true, branchId: true, agentId: true } },
    },
  });

  if (membership?.partner) {
    const { kind, branchId, agentId } = membership.partner;
    return { state: "partner", kind, live: Boolean(branchId || agentId) };
  }

  // Newest first: someone turned down once and re-applying should see the new
  // application, not the old decision.
  const application = await db.partnerApplication.findFirst({
    where: { uid },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true, reviewedAt: true },
  });

  if (!application) return { state: "none" };

  if (application.status === "pending") {
    return { state: "pending", submittedAt: application.createdAt.toISOString() };
  }

  if (application.status === "rejected") {
    return {
      state: "rejected",
      reviewedAt: application.reviewedAt?.toISOString() ?? null,
    };
  }

  // Approved on the application but no PartnerUser: not reachable through the
  // review path, which writes both in one transaction. Treat it as approved
  // rather than inviting a duplicate application.
  return { state: "partner", kind: "brand", live: false };
}
