import type {
  AgentRegion as AgentRegionRow,
  Branch as BranchRow,
  Brand as BrandRow,
  DeliveryAgent as DeliveryAgentRow,
  ProductSpec as ProductSpecRow,
  Product as ProductRow,
} from "@prisma/client";
import type {
  Brand,
  BrandCategory,
  Branch,
  DeliveryAgent,
  Product,
} from "@/data/types";

// SQLite has no enum type, so `BrandCategory` and `Branch["country"]` are plain
// text columns. These mappers are the boundary where the TypeScript unions are
// re-established: a row that does not fit throws loudly here rather than
// silently widening the domain types for every downstream consumer.

const BRAND_CATEGORIES: readonly BrandCategory[] = [
  "automotive",
  "electronics",
  "telecom",
];

function toBrandCategory(value: string, brandId: string): BrandCategory {
  const match = BRAND_CATEGORIES.find((category) => category === value);
  if (!match) {
    throw new Error(
      `Brand "${brandId}" has unknown category "${value}" (expected one of ${BRAND_CATEGORIES.join(", ")})`
    );
  }
  return match;
}

function toCountry(value: string, branchId: string): Branch["country"] {
  if (value !== "Tanzania") {
    throw new Error(
      `Branch "${branchId}" has country "${value}"; the Branch type only models Tanzania so far`
    );
  }
  return value;
}

// The static data uses optional properties; Prisma uses null. Normalising here
// keeps `toEqual` comparisons against the static records honest.
function orUndefined(value: string | null): string | undefined {
  return value ?? undefined;
}

export function mapBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: toBrandCategory(row.category, row.id),
    logo: row.logo,
    accentColor: row.accentColor,
    description: row.description,
    website: orUndefined(row.website),
  };
}

export function mapBranch(row: BranchRow): Branch {
  // A half-set coordinate would put a marker in the ocean, so a row with only
  // one of the two is treated as having none at all.
  const hasCoords = row.latitude !== null && row.longitude !== null;

  return {
    id: row.id,
    brandId: row.brandId,
    name: row.name,
    city: row.city,
    region: row.region,
    addressLine: orUndefined(row.addressLine),
    country: toCountry(row.country, row.id),
    phone: orUndefined(row.phone),
    hours: orUndefined(row.hours),
    deliveryOffered: row.deliveryOffered,
    verified: row.verified,
    // Spread rather than `coords: undefined`, so a branch without coordinates
    // has no key at all and still deep-equals its static counterpart.
    ...(hasCoords
      ? { coords: { lat: row.latitude as number, lng: row.longitude as number } }
      : {}),
  };
}

export type ProductRowWithSpecs = ProductRow & { specs: ProductSpecRow[] };

export function mapProduct(row: ProductRowWithSpecs): Product {
  return {
    id: row.id,
    slug: row.slug,
    branchId: row.branchId,
    brandId: row.brandId,
    name: row.name,
    category: row.category,
    priceTZS: row.priceTZS,
    image: row.image,
    photoUrl: orUndefined(row.photoUrl),
    description: row.description,
    // A product with no spec rows is indistinguishable from one whose specs
    // were never recorded, so both map to `undefined` — the same thing the
    // static data expresses by omitting the key.
    specs: row.specs.length > 0 ? toSpecRecord(row.specs) : undefined,
    inStock: row.inStock,
  };
}

function toSpecRecord(rows: ProductSpecRow[]): Record<string, string> {
  // Callers order by `position`, but sort defensively: spec order is visible on
  // the product page and a missing `orderBy` would be a silent regression.
  return Object.fromEntries(
    [...rows]
      .sort((a, b) => a.position - b.position)
      .map((spec) => [spec.key, spec.value])
  );
}

export type DeliveryAgentRowWithRegions = DeliveryAgentRow & {
  regionsServed: AgentRegionRow[];
};

export function mapDeliveryAgent(row: DeliveryAgentRowWithRegions): DeliveryAgent {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    regionsServed: [...row.regionsServed]
      .sort((a, b) => a.position - b.position)
      .map((region) => region.region),
    phone: orUndefined(row.phone),
    eta: { minDays: row.etaMinDays, maxDays: row.etaMaxDays },
    verified: row.verified,
  };
}
