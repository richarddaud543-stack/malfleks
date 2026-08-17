import type { Brand, Branch, DeliveryAgent } from "@/data";
import type { LatLng } from "./geo";

/** A branch already joined to its brand — the locator lists every brand at
 *  once, so a branch on its own is never enough to render. */
export interface LocatorBranch {
  branch: Branch;
  brand: Brand;
}

export interface LocatorCity {
  name: string;
  center: LatLng;
  /** Branches matching the current brand filter, which is what the marker is
   *  sized by — a big Dar marker is misleading once you have asked for BMW. */
  branchCount: number;
  agents: DeliveryAgent[];
}

export interface LocatorFilters {
  city: string | null;
  brandIds: string[];
  /** Free-text query over brand, city and branch name. Optional so the many
   *  call sites and tests written before search existed still type-check —
   *  every read below treats a missing value the same as `""`. */
  q?: string;
}

export const defaultLocatorFilters: LocatorFilters = {
  city: null,
  brandIds: [],
  q: "",
};

/**
 * Everything the locator needs, resolved once.
 *
 * This used to be module-scope state computed from the static arrays, which
 * meant the whole catalogue was reachable from a client bundle and the map
 * could never show a branch that was not compiled in. It is now built by the
 * server page and passed down, so the same functions work against the database.
 */
export interface LocatorData {
  /** Every branch with a resolvable brand, in data order. */
  branches: LocatorBranch[];
  /** Cities with a branch and a coordinate, north to south. */
  cityNames: string[];
  brands: Brand[];
  /** Couriers covering each city, keyed by city name. */
  agentsByCity: Record<string, DeliveryAgent[]>;
}

/**
 * Joins branches to brands and orders the cities. Branches whose brand is
 * missing are dropped rather than rendered half-blank, exactly as before.
 */
export function buildLocatorData(
  branches: Branch[],
  brands: Brand[],
  agentsByCity: Record<string, DeliveryAgent[]>
): LocatorData {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const locatorBranches: LocatorBranch[] = branches.flatMap((branch) => {
    const brand = brandById.get(branch.brandId);
    return brand ? [{ branch, brand }] : [];
  });

  const center = (city: string): LatLng =>
    locatorBranches.find((e) => e.branch.city === city && e.branch.coords)!
      .branch.coords!;

  const cityNames = Array.from(
    new Set(
      locatorBranches
        .filter((entry) => entry.branch.coords)
        .map((entry) => entry.branch.city)
    )
  ).sort((a, b) => center(b).lat - center(a).lat);

  return { branches: locatorBranches, cityNames, brands, agentsByCity };
}

export function getLocatorBranches(data: LocatorData): LocatorBranch[] {
  return data.branches;
}

function matchesBrands(entry: LocatorBranch, brandIds: string[]): boolean {
  // An empty selection means "every brand", not "no brand".
  return brandIds.length === 0 || brandIds.includes(entry.brand.id);
}

/** A blank query matches everything, so typing and then clearing the search
 *  field is indistinguishable from never having searched. */
function matchesQuery(entry: LocatorBranch, q: string | undefined): boolean {
  const needle = (q ?? "").trim().toLowerCase();
  if (!needle) return true;
  return (
    entry.branch.name.toLowerCase().includes(needle) ||
    entry.branch.city.toLowerCase().includes(needle) ||
    entry.brand.name.toLowerCase().includes(needle)
  );
}

export function filterBranches(
  data: LocatorData,
  filters: LocatorFilters
): LocatorBranch[] {
  return data.branches.filter(
    (entry) =>
      (filters.city === null || entry.branch.city === filters.city) &&
      matchesBrands(entry, filters.brandIds) &&
      matchesQuery(entry, filters.q)
  );
}

/** Every branch in a city carries the same city-centre coordinate, so the
 *  first one that has coordinates is the city's position. Cities are ordered
 *  north to south in `buildLocatorData`, so tabbing through the markers reads
 *  down the map rather than jumping around it. */
function centerOf(data: LocatorData, city: string): LatLng {
  const withCoords = data.branches.find(
    (entry) => entry.branch.city === city && entry.branch.coords
  );
  return withCoords!.branch.coords!;
}

export function getLocatorCities(
  data: LocatorData,
  brandIds: string[] = [],
  q: string = ""
): LocatorCity[] {
  return data.cityNames.map((name) => ({
    name,
    center: centerOf(data, name),
    branchCount: data.branches.filter(
      (entry) =>
        entry.branch.city === name &&
        matchesBrands(entry, brandIds) &&
        matchesQuery(entry, q)
    ).length,
    agents: data.agentsByCity[name] ?? [],
  }));
}

export interface BrandOption {
  brand: Brand;
  count: number;
}

/**
 * Brand chips, counted against the selected city only. Like the search facets,
 * a brand with nothing in the current city stays visible at zero rather than
 * disappearing — knowing Toyota has no Dodoma branch is the useful answer.
 */
export function getBrandOptions(
  data: LocatorData,
  city: string | null,
  q: string = ""
): BrandOption[] {
  return data.brands.map((brand) => ({
    brand,
    count: data.branches.filter(
      (entry) =>
        entry.brand.id === brand.id &&
        (city === null || entry.branch.city === city) &&
        matchesQuery(entry, q)
    ).length,
  }));
}

/** Adds a value to a selection, or removes it if it is already there. */
export function toggleBrand(brandIds: string[], brandId: string): string[] {
  return brandIds.includes(brandId)
    ? brandIds.filter((id) => id !== brandId)
    : [...brandIds, brandId];
}

/** `/locator?city=Mwanza&brand=bmw&q=kariakoo` — `q` is the same param name
 *  `/search` already uses, so a query stays predictable across the site. */
export function filtersFromParams(
  data: LocatorData,
  params: URLSearchParams
): LocatorFilters {
  const city = params.get("city");
  return {
    // A stale or misspelt city degrades to "all cities" rather than an empty page.
    city: city && data.cityNames.includes(city) ? city : null,
    brandIds: params
      .getAll("brand")
      .filter((id) => data.brands.some((brand) => brand.id === id)),
    q: params.get("q") ?? "",
  };
}

export function paramsFromFilters(filters: LocatorFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.city) params.set("city", filters.city);
  for (const id of filters.brandIds) params.append("brand", id);
  const q = (filters.q ?? "").trim();
  if (q) params.set("q", q);
  return params;
}
