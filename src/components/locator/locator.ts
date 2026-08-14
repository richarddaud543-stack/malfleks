import {
  branches,
  brands,
  getAgentsForCity,
  getBrandById,
  type Brand,
  type Branch,
  type DeliveryAgent,
} from "@/data";
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
}

export const defaultLocatorFilters: LocatorFilters = { city: null, brandIds: [] };

/** Every branch with a resolvable brand, in data order. Branches whose brand is
 *  missing are dropped rather than rendered half-blank. */
const locatorBranches: LocatorBranch[] = branches.flatMap((branch) => {
  const brand = getBrandById(branch.brandId);
  return brand ? [{ branch, brand }] : [];
});

export function getLocatorBranches(): LocatorBranch[] {
  return locatorBranches;
}

function matchesBrands(entry: LocatorBranch, brandIds: string[]): boolean {
  // An empty selection means "every brand", not "no brand".
  return brandIds.length === 0 || brandIds.includes(entry.brand.id);
}

export function filterBranches(filters: LocatorFilters): LocatorBranch[] {
  return locatorBranches.filter(
    (entry) =>
      (filters.city === null || entry.branch.city === filters.city) &&
      matchesBrands(entry, filters.brandIds)
  );
}

/** Cities that have at least one branch and a coordinate to plot it at, in
 *  north-to-south order — so tabbing through the markers reads down the map
 *  rather than jumping around it. */
const cityNames = Array.from(
  new Set(
    locatorBranches
      .filter((entry) => entry.branch.coords)
      .map((entry) => entry.branch.city)
  )
).sort((a, b) => centerOf(b).lat - centerOf(a).lat);

function centerOf(city: string): LatLng {
  // Every branch in a city carries the same city-centre coordinate, so the
  // first one that has coordinates is the city's position.
  const withCoords = locatorBranches.find(
    (entry) => entry.branch.city === city && entry.branch.coords
  );
  return withCoords!.branch.coords!;
}

export function getLocatorCities(brandIds: string[] = []): LocatorCity[] {
  return cityNames.map((name) => ({
    name,
    center: centerOf(name),
    branchCount: locatorBranches.filter(
      (entry) => entry.branch.city === name && matchesBrands(entry, brandIds)
    ).length,
    agents: getAgentsForCity(name),
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
export function getBrandOptions(city: string | null): BrandOption[] {
  return brands.map((brand) => ({
    brand,
    count: locatorBranches.filter(
      (entry) =>
        entry.brand.id === brand.id &&
        (city === null || entry.branch.city === city)
    ).length,
  }));
}

/** Adds a value to a selection, or removes it if it is already there. */
export function toggleBrand(brandIds: string[], brandId: string): string[] {
  return brandIds.includes(brandId)
    ? brandIds.filter((id) => id !== brandId)
    : [...brandIds, brandId];
}

/** `/locator?city=Mwanza&brand=bmw` — the same param names the search page and
 *  the agents page already use, so links stay predictable across the site. */
export function filtersFromParams(params: URLSearchParams): LocatorFilters {
  const city = params.get("city");
  return {
    // A stale or misspelt city degrades to "all cities" rather than an empty page.
    city: city && cityNames.includes(city) ? city : null,
    brandIds: params
      .getAll("brand")
      .filter((id) => brands.some((brand) => brand.id === id)),
  };
}

export function paramsFromFilters(filters: LocatorFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.city) params.set("city", filters.city);
  for (const id of filters.brandIds) params.append("brand", id);
  return params;
}
