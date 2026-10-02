import { notFound, redirect } from "next/navigation";

import { verifySession, type Session } from "@/server/auth/dal";
import { getPrisma } from "@/server/db/client";

/**
 * What a signed-in person is allowed to do on the partner side, and the
 * listings they own.
 *
 * ## Why this exists separately from `review.ts`
 *
 * `review.ts` is the admin's view: every application, every submission, across
 * all partners. This is the partner's own view, and the difference is the whole
 * point — **every query here is scoped by `partnerId`, resolved on the server
 * from the session's `uid`.**
 *
 * That mirrors the boundary `submitProduct` already holds. It resolves
 * `branchId` and `brandId` from the partner rather than the payload, because a
 * `branchId` in a request body would let any partner list a product under a
 * competitor's branch. The same reasoning applies to reading: a `partnerId` in
 * a URL would let any partner read a competitor's submissions and prices. So
 * the caller never supplies one.
 *
 * The pattern is the one `saved-requests.ts` uses for customers — the owner is
 * part of the WHERE, not part of the input.
 */

/** The partner a signed-in user acts for, or `null` if they are not one. */
export interface PartnerIdentity {
  partnerId: string;
  /** "brand" | "courier". Only brand partners list products. */
  kind: string;
  /** "active" | "suspended". A suspended partner may look but not submit. */
  status: string;
  displayName: string;
  city: string;
  brandId: string | null;
  branchId: string | null;
  /**
   * The `DeliveryAgent` this courier partner became, once an admin added them
   * to the routing. Null until then — and until then a courier is offered to
   * nobody, so `/partner/orders` has nothing to scope to.
   */
  agentId: string | null;
  role: string;
}

/**
 * Resolve the partner for a signed-in user.
 *
 * Returns `null` for a perfectly ordinary customer, which is the common case —
 * so callers must treat "not a partner" as normal rather than as an error.
 */
export async function partnerForUser(uid: string): Promise<PartnerIdentity | null> {
  if (uid.trim() === "") return null;

  const link = await getPrisma().partnerUser.findUnique({
    where: { uid },
    select: {
      role: true,
      partner: {
        select: {
          id: true,
          kind: true,
          status: true,
          displayName: true,
          city: true,
          brandId: true,
          branchId: true,
          agentId: true,
        },
      },
    },
  });

  if (!link) return null;

  return {
    partnerId: link.partner.id,
    kind: link.partner.kind,
    status: link.partner.status,
    displayName: link.partner.displayName,
    city: link.partner.city,
    brandId: link.partner.brandId,
    branchId: link.partner.branchId,
    agentId: link.partner.agentId,
    role: link.role,
  };
}

/** One row in the partner's own listing table. */
export interface PartnerSubmission {
  id: string;
  name: string;
  category: string;
  priceTZS: number;
  /** A `ProductIconKey` — an icon identifier, never a URL. */
  image: string;
  /** The main photo, when the partner uploaded one. Shown instead of the icon. */
  photoUrl?: string | null;
  inStock: boolean;
  /** "pending" | "published" | "rejected". */
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  /** Why it was rejected, when it was. The partner is owed the reason. */
  decisionNote: string | null;
  /** Set once published, so the partner can open the live product page. */
  publishedProductId: string | null;
}

/**
 * Everything this partner has submitted, newest first.
 *
 * Scoped by `partnerId` in the WHERE — never filtered after the fact in
 * JavaScript, which is the mistake that turns a listing query into a leak the
 * moment someone adds pagination.
 */
export async function listSubmissionsForPartner(
  partnerId: string,
): Promise<PartnerSubmission[]> {
  const rows = await getPrisma().productSubmission.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      category: true,
      priceTZS: true,
      image: true,
      photoUrl: true,
      inStock: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      decisionNote: true,
      publishedProductId: true,
    },
  });

  return rows;
}

/** Counts for the dashboard, in one query rather than three. */
export interface PartnerCounts {
  pending: number;
  published: number;
  rejected: number;
}

export async function countSubmissionsForPartner(
  partnerId: string,
): Promise<PartnerCounts> {
  const grouped = await getPrisma().productSubmission.groupBy({
    by: ["status"],
    where: { partnerId },
    _count: { _all: true },
  });

  const counts: PartnerCounts = { pending: 0, published: 0, rejected: 0 };
  for (const row of grouped) {
    if (row.status === "pending") counts.pending = row._count._all;
    else if (row.status === "published") counts.published = row._count._all;
    else if (row.status === "rejected") counts.rejected = row._count._all;
  }
  return counts;
}

/**
 * The partner for the signed-in visitor, or gone.
 *
 * The gate for every `/partner` page, in one place rather than three lines
 * copied into each route — the fourth route is the one that gets it wrong.
 *
 * The two failure modes are deliberately different, matching `requireAdmin`:
 * a signed-out visitor is *redirected*, because signing in fixes it; a
 * signed-in customer who is not a partner gets `notFound()`, because a "you
 * are not allowed here" page confirms the route exists to someone who has no
 * business knowing. `/partner` is `noindex` and absent from the sitemap for
 * the same reason.
 *
 * This never returns null, so callers need no null check — `redirect()` and
 * `notFound()` both throw.
 */
export async function requirePartner(
  next: string = "/partner",
): Promise<{ session: Session; partner: PartnerIdentity }> {
  const session = await verifySession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  const partner = await partnerForUser(session.uid);
  if (!partner) notFound();

  return { session, partner };
}
