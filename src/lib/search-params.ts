import {
  defaultFilters,
  priceBands,
  sortOptions,
  type SearchFilters,
  type SortKey,
} from "./search";

/**
 * URL <-> filter-state translation, kept apart from the search logic so the
 * shareable-URL contract can be tested on its own.
 *
 * Multi-value facets use repeated params (`?brand=bmw&brand=ford`) rather than
 * a delimiter, so values containing commas or spaces need no special casing.
 */
export const searchParamKeys = {
  q: "q",
  brand: "brand",
  category: "category",
  city: "city",
  price: "price",
  delivery: "delivery",
  stock: "stock",
  sort: "sort",
} as const;

function isSortKey(value: string): value is SortKey {
  return sortOptions.some((option) => option.value === value);
}

export function filtersFromParams(params: URLSearchParams): SearchFilters {
  const priceBand = params.get(searchParamKeys.price);
  const sort = params.get(searchParamKeys.sort) ?? "";

  return {
    q: params.get(searchParamKeys.q) ?? defaultFilters.q,
    brandIds: params.getAll(searchParamKeys.brand),
    categories: params.getAll(searchParamKeys.category),
    cities: params.getAll(searchParamKeys.city),
    // Unknown band ids are dropped so a stale link degrades to "no price filter".
    priceBand:
      priceBand && priceBands.some((band) => band.id === priceBand)
        ? priceBand
        : null,
    deliveryOnly: params.get(searchParamKeys.delivery) === "1",
    inStockOnly: params.get(searchParamKeys.stock) === "1",
    sort: isSortKey(sort) ? sort : defaultFilters.sort,
  };
}

/** Only non-default values are serialised, so an untouched search stays `/search`. */
export function paramsFromFilters(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();

  const q = filters.q.trim();
  if (q) params.set(searchParamKeys.q, q);
  for (const id of filters.brandIds) params.append(searchParamKeys.brand, id);
  for (const c of filters.categories) params.append(searchParamKeys.category, c);
  for (const city of filters.cities) params.append(searchParamKeys.city, city);
  if (filters.priceBand) params.set(searchParamKeys.price, filters.priceBand);
  if (filters.deliveryOnly) params.set(searchParamKeys.delivery, "1");
  if (filters.inStockOnly) params.set(searchParamKeys.stock, "1");
  if (filters.sort !== defaultFilters.sort) {
    params.set(searchParamKeys.sort, filters.sort);
  }

  return params;
}

export function searchHref(filters: SearchFilters): string {
  const query = paramsFromFilters(filters).toString();
  return query ? `/search?${query}` : "/search";
}

/** Adds `value` to a facet selection, or removes it if already selected. */
export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}
