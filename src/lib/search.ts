import { brands, branches, products } from "@/data";
import type { Brand, Branch, Product } from "@/data";

/**
 * Faceted search over the product catalogue.
 *
 * A product on its own is not enough to search or filter well — the things a
 * customer actually searches by (brand name, city, whether the branch delivers)
 * live on the brand and branch records. So everything here works on a `Listing`,
 * the product joined to its brand and branch.
 */
export interface Listing {
  product: Product;
  brand: Brand;
  branch: Branch;
}

export type SortKey = "relevance" | "price-asc" | "price-desc" | "name";

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name: A–Z" },
];

/**
 * The catalogue spans earbuds at TZS 32,000 and SUVs at TZS 245,000,000, so a
 * linear price slider would be unusable. Log-ish bands keep every step useful.
 */
export interface PriceBand {
  id: string;
  label: string;
  min: number;
  /** Exclusive upper bound. */
  max: number;
}

export const priceBands: PriceBand[] = [
  { id: "under-100k", label: "Under 100K", min: 0, max: 100_000 },
  { id: "100k-1m", label: "100K – 1M", min: 100_000, max: 1_000_000 },
  { id: "1m-10m", label: "1M – 10M", min: 1_000_000, max: 10_000_000 },
  { id: "10m-100m", label: "10M – 100M", min: 10_000_000, max: 100_000_000 },
  { id: "over-100m", label: "Over 100M", min: 100_000_000, max: Infinity },
];

export interface SearchFilters {
  q: string;
  brandIds: string[];
  categories: string[];
  cities: string[];
  priceBand: string | null;
  /** Only branches that run their own delivery fleet. */
  deliveryOnly: boolean;
  inStockOnly: boolean;
  sort: SortKey;
}

export const defaultFilters: SearchFilters = {
  q: "",
  brandIds: [],
  categories: [],
  cities: [],
  priceBand: null,
  deliveryOnly: false,
  inStockOnly: false,
  sort: "relevance",
};

export function isDefaultFilters(filters: SearchFilters): boolean {
  return (
    filters.q.trim() === "" &&
    filters.brandIds.length === 0 &&
    filters.categories.length === 0 &&
    filters.cities.length === 0 &&
    filters.priceBand === null &&
    !filters.deliveryOnly &&
    !filters.inStockOnly
  );
}

/** Number of active filters, not counting the free-text query or sort order. */
export function activeFilterCount(filters: SearchFilters): number {
  return (
    filters.brandIds.length +
    filters.categories.length +
    filters.cities.length +
    (filters.priceBand ? 1 : 0) +
    (filters.deliveryOnly ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0)
  );
}

let cachedListings: Listing[] | null = null;

/**
 * Every product joined to its brand and branch. Products pointing at a missing
 * brand or branch are dropped rather than rendered half-blank.
 */
export function getListings(): Listing[] {
  if (cachedListings) return cachedListings;

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const branchById = new Map(branches.map((b) => [b.id, b]));

  cachedListings = products.flatMap((product) => {
    const brand = brandById.get(product.brandId);
    const branch = branchById.get(product.branchId);
    return brand && branch ? [{ product, brand, branch }] : [];
  });

  return cachedListings;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function parseQuery(q: string): string[] {
  const normalized = normalize(q);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

/**
 * Relevance score for one listing against pre-parsed query terms.
 *
 * Terms are ANDed: a listing has to match every term somewhere, so "bmw dar"
 * narrows rather than widens. Where a term matches decides the weight — a hit
 * on the product name counts for far more than one in the description.
 */
export function scoreListing(listing: Listing, terms: string[]): number {
  if (terms.length === 0) return 0;

  const { product, brand, branch } = listing;
  const name = normalize(product.name);
  const category = normalize(product.category);
  const brandName = normalize(brand.name);
  const city = normalize(branch.city);
  const branchName = normalize(branch.name);
  const description = normalize(product.description);
  const specs = product.specs
    ? normalize(Object.values(product.specs).join(" "))
    : "";

  let total = 0;

  for (const term of terms) {
    let best = 0;
    if (name.startsWith(term)) best = 100;
    else if (name.includes(term)) best = 70;
    else if (brandName.includes(term)) best = 50;
    else if (category.includes(term)) best = 40;
    else if (city.includes(term) || branchName.includes(term)) best = 25;
    else if (description.includes(term) || specs.includes(term)) best = 10;

    // Every term must land somewhere, otherwise this is not a match at all.
    if (best === 0) return 0;
    total += best;
  }

  return total;
}

/** The filter dimensions, so facet counts can exclude their own dimension. */
type Dimension = "brand" | "category" | "city" | "price" | "delivery" | "stock";

function matches(
  listing: Listing,
  filters: SearchFilters,
  except?: Dimension
): boolean {
  const { product, brand, branch } = listing;

  if (
    except !== "brand" &&
    filters.brandIds.length > 0 &&
    !filters.brandIds.includes(brand.id)
  ) {
    return false;
  }

  if (
    except !== "category" &&
    filters.categories.length > 0 &&
    !filters.categories.includes(product.category)
  ) {
    return false;
  }

  if (
    except !== "city" &&
    filters.cities.length > 0 &&
    !filters.cities.includes(branch.city)
  ) {
    return false;
  }

  if (except !== "price" && filters.priceBand) {
    const band = priceBands.find((b) => b.id === filters.priceBand);
    // An unrecognised band id (stale URL) is ignored rather than matching nothing.
    if (band && (product.priceTZS < band.min || product.priceTZS >= band.max)) {
      return false;
    }
  }

  if (except !== "delivery" && filters.deliveryOnly && !branch.deliveryOffered) {
    return false;
  }

  if (except !== "stock" && filters.inStockOnly && !product.inStock) {
    return false;
  }

  return true;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  brands: FacetOption[];
  categories: FacetOption[];
  cities: FacetOption[];
  priceBands: FacetOption[];
}

export interface SearchResult {
  listings: Listing[];
  facets: Facets;
  /** Listings matching the text query alone, before any facet filtering. */
  queryMatchCount: number;
}

function countBy(
  listings: Listing[],
  filters: SearchFilters,
  dimension: Dimension,
  key: (listing: Listing) => string | null
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    // Counts for a dimension ignore that dimension's own selections, so a
    // checked box doesn't zero out its siblings.
    if (!matches(listing, filters, dimension)) continue;
    const value = key(listing);
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function searchProducts(
  filters: SearchFilters,
  listings: Listing[] = getListings()
): SearchResult {
  const terms = parseQuery(filters.q);

  const scored =
    terms.length === 0
      ? listings.map((listing) => ({ listing, score: 0 }))
      : listings
          .map((listing) => ({ listing, score: scoreListing(listing, terms) }))
          .filter((entry) => entry.score > 0);

  const queryMatched = scored.map((entry) => entry.listing);

  const brandCounts = countBy(queryMatched, filters, "brand", (l) => l.brand.id);
  const categoryCounts = countBy(queryMatched, filters, "category", (l) => l.product.category);
  const cityCounts = countBy(queryMatched, filters, "city", (l) => l.branch.city);
  const priceCounts = countBy(queryMatched, filters, "price", (l) => {
    const band = priceBands.find(
      (b) => l.product.priceTZS >= b.min && l.product.priceTZS < b.max
    );
    return band ? band.id : null;
  });

  const filtered = scored.filter((entry) => matches(entry.listing, filters));

  const sorted = [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "price-asc":
        return a.listing.product.priceTZS - b.listing.product.priceTZS;
      case "price-desc":
        return b.listing.product.priceTZS - a.listing.product.priceTZS;
      case "name":
        return a.listing.product.name.localeCompare(b.listing.product.name);
      case "relevance":
      default:
        // With no query every score is 0, so this falls through to name order
        // and the grid stays stable instead of shuffling on each filter change.
        return (
          b.score - a.score ||
          a.listing.product.name.localeCompare(b.listing.product.name)
        );
    }
  });

  const toOptions = (
    counts: Map<string, number>,
    all: { value: string; label: string }[]
  ): FacetOption[] =>
    all.map(({ value, label }) => ({
      value,
      label,
      count: counts.get(value) ?? 0,
    }));

  return {
    listings: sorted.map((entry) => entry.listing),
    queryMatchCount: queryMatched.length,
    facets: {
      brands: toOptions(
        brandCounts,
        brands.map((b) => ({ value: b.id, label: b.name }))
      ),
      categories: toOptions(
        categoryCounts,
        allCategories().map((c) => ({ value: c, label: c }))
      ),
      cities: toOptions(
        cityCounts,
        allCities().map((c) => ({ value: c, label: c }))
      ),
      priceBands: toOptions(
        priceCounts,
        priceBands.map((b) => ({ value: b.id, label: b.label }))
      ),
    },
  };
}

export function allCategories(): string[] {
  return [...new Set(products.map((p) => p.category))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export function allCities(): string[] {
  return [...new Set(branches.map((b) => b.city))].sort((a, b) =>
    a.localeCompare(b)
  );
}
