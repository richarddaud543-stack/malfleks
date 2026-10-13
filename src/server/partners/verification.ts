import type { Prisma } from "@prisma/client";

import { missingDocumentKinds, requiredDocumentKinds, type DocumentKind } from "@/lib/partner-document";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";
import { raiseAlert, resolveAlertFor } from "@/server/rules/alerts";

/**
 * What "verified" means on MalFleks, for shops and delivery riders, in one place.
 *
 * The advert, the Terms and the product pages say every shop on MalFleks has
 * been checked: a business licence, a TIN certificate and a photo of the shop
 * front, read by a person. Until 12 Oct 2026 the documents could be uploaded
 * only while applying, and the three shops approved before 9 Oct never sent
 * any -- so nothing on the site was verified, and nothing said so.
 *
 * A shop is verified when `Partner.documentsVerifiedAt` is set. That happens in
 * exactly two ways, both by a person:
 *
 * - **Approval**, when the application already carried all three documents --
 *   the owner read them to approve it (`approveApplication`).
 * - **"Documents checked"** on the shop's console page, after a shop that was
 *   approved without them uploads them from its partner page.
 *
 * Delivery riders (`kind: "courier"`) are verified the same way, on one
 * document: their driving licence (added 13 Oct 2026). A rider is verified at
 * approval when the application carried it, or with "Documents checked" once
 * they upload it from their partner page -- and is not put into the delivery
 * routing until then (`activateCourierPartner`).
 *
 * An unverified shop is given `SHOP_VERIFICATION.graceDays` after it is first
 * told, then its products come off the shop until it is verified -- the
 * `shop-verification` rule. Verifying puts back exactly what that rule hid.
 * An unverified rider already in the routing is not taken out automatically:
 * it may be the only rider a city has, and removing it would leave every shop
 * there unorderable. The owner is told instead, urgently, and decides.
 */

export const VERIFICATION_ALERT_KEY = "shop-verification";
/** "A partner sent its documents and they are waiting for you." One open at a time per partner. */
export const DOCUMENTS_ARRIVED_ALERT_KEY = "shop-documents";
/** "A rider's licence is past its deadline and the rider is still delivering." Urgent; one per rider. */
export const RIDER_OVERDUE_ALERT_KEY = "rider-licence-overdue";

export interface PartnerDocumentRow {
  id: string;
  kind: string;
  uploadedAt: Date;
  aiVerdict: string | null;
  aiNotes: string | null;
}

export interface PartnerVerificationState {
  partnerId: string;
  /** "brand" (a shop) or "courier" (a delivery rider): decides which documents count. */
  kind: string;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  missing: DocumentKind[];
  documents: PartnerDocumentRow[];
}

export async function partnerVerificationState(partnerId: string): Promise<PartnerVerificationState | null> {
  const db = getPrisma();
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, kind: true, applicationId: true, documentsVerifiedAt: true, documentsVerifiedBy: true },
  });
  if (!partner) return null;
  const documents = await db.partnerDocument.findMany({
    where: { applicationId: partner.applicationId },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, kind: true, uploadedAt: true, aiVerdict: true, aiNotes: true },
  });
  return {
    partnerId: partner.id,
    kind: partner.kind,
    verifiedAt: partner.documentsVerifiedAt,
    verifiedBy: partner.documentsVerifiedBy,
    missing: missingDocumentKinds(documents, partner.kind),
    documents,
  };
}

/** What a partner sees about its own documents on its partner page. */
export interface PartnerDocumentsView {
  kind: string;
  verifiedAt: Date | null;
  received: DocumentKind[];
  missing: DocumentKind[];
  /** The date the rule gave it, while the rule is waiting: a shop's products come off the shop after it. */
  deadline: Date | null;
  /** True once the rule has hidden a shop's products. Never true for a rider. */
  hidden: boolean;
}

export async function partnerDocumentsView(partnerId: string): Promise<PartnerDocumentsView | null> {
  const state = await partnerVerificationState(partnerId);
  if (!state) return null;
  const open = await getPrisma().ownerAlert.findUnique({
    where: { openKey: `${VERIFICATION_ALERT_KEY}:${partnerId}` },
    select: { data: true },
  });
  const hold = open ? asVerificationHold(open.data) : null;
  const kinds = new Set(state.documents.map((d) => d.kind));
  return {
    kind: state.kind,
    verifiedAt: state.verifiedAt,
    received: requiredDocumentKinds(state.kind).filter((kind) => kinds.has(kind)),
    missing: state.missing,
    deadline: hold ? new Date(hold.deadline) : null,
    hidden: Boolean(hold?.hiddenAt),
  };
}

export type MarkVerifiedOutcome =
  /**
   * `restoreFailed`: the verification is saved, but putting back what the
   * rule hid failed. The alert stays open, and the rule's next pass finishes it.
   */
  | { ok: true; restored: number; restoreFailed?: true }
  | { ok: false; reason: "not-found" | "documents-missing" | "already-verified" };

/**
 * A person at MalFleks has read a partner's documents -- a shop's three, or a
 * rider's driving licence -- and they are in order. Refuses while any is
 * missing: "verified" with a document missing is exactly the claim this exists
 * to keep honest.
 */
export async function markDocumentsChecked(partnerId: string, adminUid: string, now: Date = new Date()): Promise<MarkVerifiedOutcome> {
  const state = await partnerVerificationState(partnerId);
  if (!state) return { ok: false, reason: "not-found" };
  if (state.missing.length > 0) return { ok: false, reason: "documents-missing" };

  const db = getPrisma();
  // The null in the WHERE: two admins pressing at once record one verification.
  const { count } = await db.partner.updateMany({
    where: { id: partnerId, documentsVerifiedAt: null },
    data: { documentsVerifiedAt: now, documentsVerifiedBy: adminUid },
  });
  if (count === 0) return { ok: false, reason: "already-verified" };

  // The partner IS verified from here, whatever happens next. A failure putting
  // a shop's products back must not read as "not verified": it is reported
  // apart, and the rule retries it (`shopVerification`, verified partners' open alerts).
  try {
    return { ok: true, restored: await releaseVerificationHold(partnerId, adminUid) };
  } catch (error) {
    await logServerError("shop-verification-release", error, adminUid);
    return { ok: true, restored: 0, restoreFailed: true };
  }
}

/**
 * Put back the products the rule hid -- only those, and only while they still
 * carry the moment the rule hid them, so a product an admin hid for another
 * reason since stays hidden -- then close the partner's alerts. A rider has
 * nothing hidden; only its alerts are closed.
 *
 * Products first, alerts second: if putting the products back fails, the
 * verification alert is still open, and the rule's next pass sees a verified
 * shop with an open alert and calls this again. Safe to repeat.
 *
 * Every alert this rule ever raised for the shop is read, not only the open
 * one: if the owner pressed "Done" on an alert without verifying, the rule
 * starts a new one, and the products the first one hid are still owed back.
 */
export async function releaseVerificationHold(partnerId: string, by: string): Promise<number> {
  const db = getPrisma();
  const alerts = await db.ownerAlert.findMany({
    where: { key: VERIFICATION_ALERT_KEY, data: { path: ["partnerId"], equals: partnerId } },
    select: { data: true },
    take: 50,
  });
  let restored = 0;
  for (const alert of alerts) {
    const hold = asVerificationHold(alert.data);
    if (!hold?.hiddenAt || !hold.productIds?.length) continue;
    const { count } = await db.product.updateMany({
      where: { id: { in: hold.productIds }, hiddenAt: new Date(hold.hiddenAt) },
      data: { hiddenAt: null },
    });
    restored += count;
  }
  if (restored > 0) await notifyPublicSiteOfCatalogueChange();
  await resolveAlertFor(VERIFICATION_ALERT_KEY, partnerId, by);
  await resolveAlertFor(DOCUMENTS_ARRIVED_ALERT_KEY, partnerId, by);
  await resolveAlertFor(RIDER_OVERDUE_ALERT_KEY, partnerId, by);
  return restored;
}

/**
 * Called after documents are attached to an application. When that
 * application already became a partner -- a shop or rider approved before
 * documents were asked for, uploading them now from its partner page -- the owner is told
 * they are waiting to be read. Nothing is verified by uploading: a person
 * reads them.
 *
 * Never throws: the upload succeeded whatever happens here.
 */
export async function tellOwnerDocumentsArrived(applicationId: string): Promise<boolean> {
  try {
    const db = getPrisma();
    const partner = await db.partner.findUnique({
      where: { applicationId },
      select: { id: true, kind: true, displayName: true, city: true, documentsVerifiedAt: true },
    });
    if (!partner || partner.documentsVerifiedAt) return false;
    const rider = partner.kind === "courier";
    const documents = await db.partnerDocument.findMany({ where: { applicationId }, select: { kind: true } });
    const missing = missingDocumentKinds(documents, partner.kind);
    const { raised } = await raiseAlert({
      key: DOCUMENTS_ARRIVED_ALERT_KEY,
      subjectId: partner.id,
      urgency: "routine",
      subject: `${partner.displayName} has sent its documents`.slice(0, 200),
      body: [
        `${partner.displayName} (${partner.city}) has uploaded documents from its partner page.`,
        missing.length === 0
          ? rider
            ? "Their driving licence is there."
            : "All three are there: business licence, TIN certificate and shop-front photo."
          : `Still missing: ${missing.join(", ")}.`,
        "",
        `Open the ${rider ? "rider" : "shop"} in the console, read ${rider ? "it" : "them"}, and press "Documents checked" if ${rider ? "it is" : "they are"} in order.`,
        rider
          ? "Until you do, the rider cannot be put into the delivery routing."
          : "Until you do, the shop does not show as verified.",
      ].join("\n"),
      href: `/admin/partners/${partner.id}`,
      data: { partnerId: partner.id },
    });
    return raised;
  } catch (error) {
    await logServerError("shop-documents-arrived", error);
    return false;
  }
}

/** Whether the shop behind this catalogue branch has been verified. False on any doubt. */
export async function isVerifiedShop(branchId: string): Promise<boolean> {
  try {
    const count = await getPrisma().partner.count({
      where: { kind: "brand", status: "active", branchId, documentsVerifiedAt: { not: null } },
    });
    return count > 0;
  } catch {
    // A badge that claims "verified" must never appear because a query failed;
    // its absence when the database is briefly unreachable costs nothing.
    return false;
  }
}

/** What the rule stores on its alert, so verifying can undo exactly what it did. */
export interface VerificationHold {
  partnerId: string;
  /** Null for a shop not yet put on the map, and for a rider: asked, but nothing to hide. */
  branchId: string | null;
  /** ISO. Set once the owner was told a rider is past its deadline. Riders only. */
  escalatedAt?: string;
  /** ISO. When the shop's products come off the shop if still unverified. */
  deadline: string;
  /** ISO. Set once the products were hidden. */
  hiddenAt?: string;
  productIds?: string[];
}

export function asVerificationHold(data: Prisma.JsonValue | null): VerificationHold | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.partnerId !== "string" || typeof d.deadline !== "string") return null;
  return {
    partnerId: d.partnerId,
    branchId: typeof d.branchId === "string" ? d.branchId : null,
    deadline: d.deadline,
    ...(typeof d.hiddenAt === "string" ? { hiddenAt: d.hiddenAt } : {}),
    ...(typeof d.escalatedAt === "string" ? { escalatedAt: d.escalatedAt } : {}),
    ...(Array.isArray(d.productIds) ? { productIds: d.productIds.filter((x): x is string => typeof x === "string") } : {}),
  };
}
