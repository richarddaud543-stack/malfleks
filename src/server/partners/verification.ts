import type { Prisma } from "@prisma/client";

import { missingDocumentKinds, REQUIRED_DOCUMENT_KINDS, type DocumentKind } from "@/lib/partner-document";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";
import { raiseAlert, resolveAlertFor } from "@/server/rules/alerts";

/**
 * What "verified shop" means on MalFleks, in one place.
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
 * Couriers are not shops and are not covered: the Terms say riders are
 * "approved by MalFleks", which approval already is.
 *
 * An unverified shop is given `SHOP_VERIFICATION.graceDays` after it is first
 * told, then its products come off the shop until it is verified -- the
 * `shop-verification` rule. Verifying puts back exactly what that rule hid.
 */

export const VERIFICATION_ALERT_KEY = "shop-verification";
/** "A shop sent its documents and they are waiting for you." One open at a time per shop. */
export const DOCUMENTS_ARRIVED_ALERT_KEY = "shop-documents";

export interface ShopDocumentRow {
  id: string;
  kind: string;
  uploadedAt: Date;
  aiVerdict: string | null;
  aiNotes: string | null;
}

export interface ShopVerificationState {
  partnerId: string;
  /** Only a "brand" partner is a shop. */
  isShop: boolean;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  missing: DocumentKind[];
  documents: ShopDocumentRow[];
}

export async function shopVerificationState(partnerId: string): Promise<ShopVerificationState | null> {
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
    isShop: partner.kind === "brand",
    verifiedAt: partner.documentsVerifiedAt,
    verifiedBy: partner.documentsVerifiedBy,
    missing: missingDocumentKinds(documents),
    documents,
  };
}

/** What a shop sees about its own documents on its partner page. */
export interface ShopDocumentsView {
  verifiedAt: Date | null;
  received: DocumentKind[];
  missing: DocumentKind[];
  /** When its products come off the shop if still unverified, while the rule is waiting. */
  deadline: Date | null;
  /** True once the rule has hidden its products. */
  hidden: boolean;
}

export async function shopDocumentsView(partnerId: string): Promise<ShopDocumentsView | null> {
  const state = await shopVerificationState(partnerId);
  if (!state || !state.isShop) return null;
  const open = await getPrisma().ownerAlert.findUnique({
    where: { openKey: `${VERIFICATION_ALERT_KEY}:${partnerId}` },
    select: { data: true },
  });
  const hold = open ? asVerificationHold(open.data) : null;
  const kinds = new Set(state.documents.map((d) => d.kind));
  return {
    verifiedAt: state.verifiedAt,
    received: REQUIRED_DOCUMENT_KINDS.filter((kind) => kinds.has(kind)),
    missing: state.missing,
    deadline: hold ? new Date(hold.deadline) : null,
    hidden: Boolean(hold?.hiddenAt),
  };
}

export type MarkVerifiedOutcome =
  | { ok: true; restored: number }
  | { ok: false; reason: "not-found" | "not-a-shop" | "documents-missing" | "already-verified" };

/**
 * A person at MalFleks has read a shop's three documents and they are in
 * order. Refuses while any of the three is missing: "verified" with a document
 * missing is exactly the claim this exists to keep honest.
 */
export async function markShopVerified(partnerId: string, adminUid: string, now: Date = new Date()): Promise<MarkVerifiedOutcome> {
  const state = await shopVerificationState(partnerId);
  if (!state) return { ok: false, reason: "not-found" };
  if (!state.isShop) return { ok: false, reason: "not-a-shop" };
  if (state.missing.length > 0) return { ok: false, reason: "documents-missing" };

  const db = getPrisma();
  // The null in the WHERE: two admins pressing at once record one verification.
  const { count } = await db.partner.updateMany({
    where: { id: partnerId, documentsVerifiedAt: null },
    data: { documentsVerifiedAt: now, documentsVerifiedBy: adminUid },
  });
  if (count === 0) return { ok: false, reason: "already-verified" };

  const restored = await releaseVerificationHold(partnerId, adminUid);
  return { ok: true, restored };
}

/**
 * Close the shop's verification alert and put back the products the rule hid
 * -- only those, and only while they still carry the moment the rule hid them,
 * so a product an admin hid for another reason since stays hidden.
 *
 * Every alert this rule ever raised for the shop is read, not only the open
 * one: if the owner pressed "Done" on an alert without verifying, the rule
 * starts a new one, and the products the first one hid are still owed back.
 */
async function releaseVerificationHold(partnerId: string, by: string): Promise<number> {
  const db = getPrisma();
  const alerts = await db.ownerAlert.findMany({
    where: { key: VERIFICATION_ALERT_KEY, data: { path: ["partnerId"], equals: partnerId } },
    select: { data: true },
    take: 50,
  });
  await resolveAlertFor(VERIFICATION_ALERT_KEY, partnerId, by);
  await resolveAlertFor(DOCUMENTS_ARRIVED_ALERT_KEY, partnerId, by);

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
  return restored;
}

/**
 * Called after documents are attached to an application. When that
 * application already became a shop -- one approved before documents were
 * asked for, uploading them now from its partner page -- the owner is told
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
    if (!partner || partner.kind !== "brand" || partner.documentsVerifiedAt) return false;
    const documents = await db.partnerDocument.findMany({ where: { applicationId }, select: { kind: true } });
    const missing = missingDocumentKinds(documents);
    const { raised } = await raiseAlert({
      key: DOCUMENTS_ARRIVED_ALERT_KEY,
      subjectId: partner.id,
      urgency: "routine",
      subject: `${partner.displayName} has sent its documents`.slice(0, 200),
      body: [
        `${partner.displayName} (${partner.city}) has uploaded documents from its partner page.`,
        missing.length === 0
          ? "All three are there: business licence, TIN certificate and shop-front photo."
          : `Still missing: ${missing.join(", ")}.`,
        "",
        'Open the shop in the console, read them, and press "Documents checked" if they are in order.',
        "Until you do, the shop does not show as verified.",
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

/** The catalogue branches whose shop has been verified. One query, for badges. */
export async function verifiedShopBranchIds(): Promise<Set<string>> {
  const rows = await getPrisma().partner.findMany({
    where: { kind: "brand", status: "active", branchId: { not: null }, documentsVerifiedAt: { not: null } },
    select: { branchId: true },
  });
  return new Set(rows.map((r) => r.branchId).filter((id): id is string => Boolean(id)));
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
  /** Null for a shop not yet put on the map: it is asked, but has nothing to hide. */
  branchId: string | null;
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
    ...(Array.isArray(d.productIds) ? { productIds: d.productIds.filter((x): x is string => typeof x === "string") } : {}),
  };
}
