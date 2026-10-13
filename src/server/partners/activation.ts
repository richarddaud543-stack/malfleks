import { getPrisma } from "@/server/db/client";

/**
 * The step that was missing, and it broke every loop in the marketplace.
 *
 * Approving an application creates a `Partner` and a `PartnerUser` — an account
 * that can sign in. It deliberately does **not** create anything a customer can
 * see, because a `Branch` row is customer-facing data and an address nobody has
 * confirmed must never appear on the locator just because a stranger filled in
 * a form. `prisma/schema.prisma` says exactly that above `model Partner`.
 *
 * The problem was that nothing else created one either. `Partner.branchId` and
 * `Partner.agentId` stayed null forever, and the consequences ran through the
 * whole product:
 *
 *   * A brand partner could submit products, but `canPublish` answers
 *     `no-branch` for a submission whose partner has no branch — so no product
 *     could ever go live, and the admin queue had no way to fix it.
 *   * A courier partner never became a `DeliveryAgent`, so they were never
 *     offered to a customer, and every branch that does not run its own
 *     delivery was unorderable: `orderBlockReason` returns "No delivery agent
 *     currently serves this branch's city".
 *   * With the seeded catalogue emptied, those were not edge cases. They were
 *     every case.
 *
 * This module is that step, and it stays a *separate, deliberate* one performed
 * by an admin who has spoken to the business — not a side effect of approval.
 * The difference is the whole reason `verified` exists.
 */

/**
 * Approximate city-centre coordinates for the cities MalFleks serves.
 *
 * The locator needs a position or the branch does not appear on the map at all.
 * These are city centres, not shopfronts — public, checkable facts about where
 * the city is, which is exactly what the schema's own comment says the columns
 * are for ("approximate city-centre position ... the precision here (a city,
 * not a shopfront)"). Nothing here claims to be a street address, and a branch
 * whose `addressLine` is null still tells the visitor to confirm before
 * travelling.
 */
export const CITY_CENTRES: Record<string, { latitude: number; longitude: number }> = {
  "Dar es Salaam": { latitude: -6.7924, longitude: 39.2083 },
  Arusha: { latitude: -3.3869, longitude: 36.683 },
  Mwanza: { latitude: -2.5164, longitude: 32.9175 },
  Dodoma: { latitude: -6.163, longitude: 35.7516 },
};

/** `"Kariakoo Electronics"` → `"kariakoo-electronics"`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ActivationBlocker =
  | "not-found"
  | "wrong-kind"
  | "partner-suspended"
  | "already-live"
  | "missing-field"
  | "unknown-city"
  | "invalid-eta"
  | "name-taken"
  /** A rider whose driving licence nobody at MalFleks has checked yet. */
  | "licence-not-checked";

export type ActivationOutcome =
  | { ok: true; value: { brandId?: string; branchId?: string; agentId?: string } }
  | { ok: false; reason: ActivationBlocker };

export interface BrandActivationInput {
  /** An existing brand to attach this branch to, or `null` to create one. */
  brandId: string | null;
  /** Required when `brandId` is null. */
  brandName: string;
  /** "automotive" | "electronics" | "telecom". */
  category: string;
  branchName: string;
  city: string;
  /** Only when it has actually been confirmed. Null is the honest default. */
  addressLine: string | null;
  phone: string | null;
  hours: string | null;
  /** True when the brand runs its own delivery; false routes to a courier. */
  deliveryOffered: boolean;
  /**
   * Whether a person at MalFleks has confirmed this branch against the business's
   * own records. Never inferred — the admin ticks it, and it is what the trust
   * badge on the branch page reports.
   */
  verified: boolean;
}

export interface CourierActivationInput {
  name: string;
  city: string;
  /** Cities this courier will carry to, beyond its own. */
  regionsServed: string[];
  etaMinDays: number;
  etaMaxDays: number;
  phone: string | null;
  verified: boolean;
}

/** An approved partner who is not yet in the catalogue. */
export interface ActivatablePartner {
  partnerId: string;
  kind: string;
  status: string;
  displayName: string;
  contactName: string;
  phone: string;
  city: string;
  address: string | null;
  /** The brand they claimed on their application, if it is already known. */
  brandId: string | null;
  approvedAt: Date;
  /** Riders only matter here: false until their driving licence is checked, and they can't be added before. */
  documentsChecked: boolean;
}

/**
 * Approved partners with nothing live yet — the admin's "still to wire up" list.
 *
 * A brand partner is waiting while `branchId` is null; a courier while `agentId`
 * is. Suspended partners are excluded: there is nothing to publish for an
 * account that may not trade.
 */
export async function listActivatablePartners(): Promise<ActivatablePartner[]> {
  const rows = await getPrisma().partner.findMany({
    where: {
      status: "active",
      OR: [
        { kind: "brand", branchId: null },
        { kind: "courier", agentId: null },
      ],
    },
    orderBy: { approvedAt: "asc" },
    select: {
      id: true,
      kind: true,
      status: true,
      displayName: true,
      contactName: true,
      phone: true,
      city: true,
      address: true,
      brandId: true,
      approvedAt: true,
      documentsVerifiedAt: true,
    },
  });

  return rows.map((row) => ({
    partnerId: row.id,
    kind: row.kind,
    status: row.status,
    displayName: row.displayName,
    contactName: row.contactName,
    phone: row.phone,
    city: row.city,
    address: row.address,
    brandId: row.brandId,
    approvedAt: row.approvedAt,
    documentsChecked: row.documentsVerifiedAt !== null,
  }));
}

/** Brands already in the catalogue, for the "attach to an existing brand" case. */
export async function listBrandsForActivation(): Promise<
  { id: string; name: string }[]
> {
  return getPrisma().brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Put a brand partner's branch on the map.
 *
 * One transaction: create the brand if it is new, create the branch, and point
 * the partner at both. Half of this would be worse than none of it — a branch
 * with no partner attached is a shopfront nobody can list products for, and a
 * partner pointing at a branch that failed to insert is a foreign key to
 * nowhere.
 */
export async function activateBrandPartner(
  partnerId: string,
  input: BrandActivationInput,
): Promise<ActivationOutcome> {
  const db = getPrisma();

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { kind: true, status: true, branchId: true },
  });

  if (!partner) return { ok: false, reason: "not-found" };
  if (partner.kind !== "brand") return { ok: false, reason: "wrong-kind" };
  if (partner.status !== "active") {
    return { ok: false, reason: "partner-suspended" };
  }
  // Not an error worth a stack trace, but not something to do twice either:
  // a second branch for the same partner would silently orphan the first.
  if (partner.branchId) return { ok: false, reason: "already-live" };

  const branchName = input.branchName.trim();
  const brandName = input.brandName.trim();
  const city = input.city.trim();

  if (branchName === "" || city === "") {
    return { ok: false, reason: "missing-field" };
  }
  if (!input.brandId && brandName === "") {
    return { ok: false, reason: "missing-field" };
  }
  // The locator needs a position, and inventing coordinates for a city we do
  // not serve would put a pin in the sea.
  const centre = CITY_CENTRES[city];
  if (!centre) return { ok: false, reason: "unknown-city" };

  try {
    const value = await db.$transaction(async (tx) => {
      let brandId = input.brandId;

      if (!brandId) {
        const slug = slugify(brandName);
        if (slug === "") throw new MissingField();

        const last = await tx.brand.findFirst({
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });

        const brand = await tx.brand.create({
          data: {
            id: slug,
            slug,
            name: brandName,
            category: input.category,
            // No storage bucket exists, so there is no logo to point at. An
            // empty string rather than a path to a file that is not there:
            // `BrandLogo` draws a monogram when this is blank, and a broken
            // image is a worse first impression than initials.
            logo: "",
            accentColor: "#1f6f5c",
            description: `${brandName} on MalFleks.`,
            sortOrder: (last?.sortOrder ?? -1) + 1,
          },
          select: { id: true },
        });
        brandId = brand.id;
      }

      const branchId = `${brandId}-${slugify(city)}`;
      const lastBranch = await tx.branch.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      await tx.branch.create({
        data: {
          id: branchId,
          brandId,
          name: branchName,
          city,
          // Every city MalFleks serves is its own region. Kept as a column because
          // couriers are matched on it and a future district split needs it.
          region: city,
          addressLine: input.addressLine?.trim() || null,
          phone: input.phone?.trim() || null,
          hours: input.hours?.trim() || null,
          deliveryOffered: input.deliveryOffered,
          verified: input.verified,
          latitude: centre.latitude,
          longitude: centre.longitude,
          sortOrder: (lastBranch?.sortOrder ?? -1) + 1,
        },
      });

      await tx.partner.update({
        where: { id: partnerId },
        data: { brandId, branchId },
      });

      return { brandId, branchId };
    });

    return { ok: true, value };
  } catch (error) {
    if (error instanceof MissingField) {
      return { ok: false, reason: "missing-field" };
    }
    // `Brand.id`, `Brand.slug` and `Branch.id` are all unique. Two partners for
    // the same brand in the same city collide here, and the admin is owed the
    // real reason rather than "something went wrong".
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

/**
 * Put a courier into the delivery routing.
 *
 * Until this runs, a courier partner exists but is offered to nobody, and every
 * branch in their city that does not deliver itself stays unorderable.
 */
export async function activateCourierPartner(
  partnerId: string,
  input: CourierActivationInput,
): Promise<ActivationOutcome> {
  const db = getPrisma();

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { kind: true, status: true, agentId: true, documentsVerifiedAt: true },
  });

  if (!partner) return { ok: false, reason: "not-found" };
  if (partner.kind !== "courier") return { ok: false, reason: "wrong-kind" };
  if (partner.status !== "active") {
    return { ok: false, reason: "partner-suspended" };
  }
  if (partner.agentId) return { ok: false, reason: "already-live" };
  // Nobody is sent to a customer's door until a person at MalFleks has read
  // their driving licence (`markDocumentsChecked`, or approval with it attached).
  if (!partner.documentsVerifiedAt) return { ok: false, reason: "licence-not-checked" };

  const name = input.name.trim();
  const city = input.city.trim();
  if (name === "" || city === "") return { ok: false, reason: "missing-field" };
  if (!CITY_CENTRES[city]) return { ok: false, reason: "unknown-city" };

  // `0` means same day and is legitimate; the pair must be whole days and in
  // order, or `formatEta` renders "3–1 days".
  if (
    !Number.isInteger(input.etaMinDays) ||
    !Number.isInteger(input.etaMaxDays) ||
    input.etaMinDays < 0 ||
    input.etaMaxDays < input.etaMinDays
  ) {
    return { ok: false, reason: "invalid-eta" };
  }

  // Their own city always counts, whatever the form said, and duplicates would
  // violate the AgentRegion primary key.
  const regions = Array.from(
    new Set([city, ...input.regionsServed.map((r) => r.trim()).filter(Boolean)]),
  );

  try {
    const value = await db.$transaction(async (tx) => {
      const agentId = slugify(name);
      if (agentId === "") throw new MissingField();

      const last = await tx.deliveryAgent.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      await tx.deliveryAgent.create({
        data: {
          id: agentId,
          name,
          city,
          phone: input.phone?.trim() || null,
          verified: input.verified,
          etaMinDays: input.etaMinDays,
          etaMaxDays: input.etaMaxDays,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          regionsServed: {
            create: regions.map((region, position) => ({ region, position })),
          },
        },
      });

      await tx.partner.update({
        where: { id: partnerId },
        data: { agentId },
      });

      return { agentId };
    });

    return { ok: true, value };
  } catch (error) {
    if (error instanceof MissingField) {
      return { ok: false, reason: "missing-field" };
    }
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

/** Thrown inside a transaction so the whole thing rolls back. */
class MissingField extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
