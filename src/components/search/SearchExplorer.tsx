"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  activeFilterCount,
  defaultFilters,
  isDefaultFilters,
  searchProducts,
  sortOptions,
  type SearchFilters,
  type SortKey,
} from "@/lib/search";
import {
  filtersFromParams,
  paramsFromFilters,
  toggleValue,
} from "@/lib/search-params";
import FacetGroup from "./FacetGroup";
import ListingCard from "./ListingCard";

/** How long typing settles before the query is pushed into the URL. */
const QUERY_DEBOUNCE_MS = 250;

export default function SearchExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for filters, which makes every search
  // shareable and the back button work without extra bookkeeping.
  const urlFilters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  // A route update lands a tick or two after the click, which would leave
  // checkboxes and chips visibly lagging the input they just received. The
  // optimistic copy renders the new state immediately and is superseded by
  // `urlFilters` as soon as the navigation resolves.
  const [filters, setOptimisticFilters] = useOptimistic(urlFilters);
  const [, startTransition] = useTransition();

  const commit = useCallback(
    (next: SearchFilters) => {
      const query = paramsFromFilters(next).toString();
      startTransition(() => {
        setOptimisticFilters(next);
        router.replace(query ? `/search?${query}` : "/search", {
          scroll: false,
        });
      });
    },
    [router, setOptimisticFilters]
  );

  // The input stays local so typing is never gated on a route update; the URL
  // catches up once typing pauses.
  const [draft, setDraft] = useState(urlFilters.q);
  // Set when this component is the one changing `?q=`, so the sync-back effect
  // below can tell its own writes apart from a real navigation.
  const selfUpdated = useRef(false);

  useEffect(() => {
    if (draft === filters.q) return;
    const timer = setTimeout(() => {
      selfUpdated.current = true;
      commit({ ...filters, q: draft });
    }, QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, filters, commit]);

  useEffect(() => {
    // Ignore the echo of our own debounced write — adopting it would clobber
    // anything typed while it was in flight.
    if (selfUpdated.current) {
      selfUpdated.current = false;
      return;
    }
    // Back/forward navigation changed the query out from under the input.
    setDraft(urlFilters.q);
  }, [urlFilters.q]);

  const [panelOpen, setPanelOpen] = useState(false);

  const { listings, facets } = useMemo(
    () => searchProducts(filters),
    [filters]
  );

  const filterCount = activeFilterCount(filters);
  const isEmpty = isDefaultFilters(filters);

  const update = (patch: Partial<SearchFilters>) =>
    commit({ ...filters, ...patch });

  const facetPanel = (
    <div className="flex flex-col gap-6">
      <FacetGroup
        title="Brand"
        options={facets.brands}
        selected={filters.brandIds}
        onToggle={(value) =>
          update({ brandIds: toggleValue(filters.brandIds, value) })
        }
      />
      <FacetGroup
        title="Category"
        options={facets.categories}
        selected={filters.categories}
        onToggle={(value) =>
          update({ categories: toggleValue(filters.categories, value) })
        }
      />
      <FacetGroup
        title="City"
        options={facets.cities}
        selected={filters.cities}
        onToggle={(value) =>
          update({ cities: toggleValue(filters.cities, value) })
        }
      />
      <FacetGroup
        title="Price (TZS)"
        options={facets.priceBands}
        selected={filters.priceBand ? [filters.priceBand] : []}
        // Price is single-select: picking the active band clears it.
        onToggle={(value) =>
          update({ priceBand: filters.priceBand === value ? null : value })
        }
      />

      <fieldset className="border-0 p-0">
        <legend className="text-xs font-medium tracking-wide text-muted uppercase">
          Delivery &amp; stock
        </legend>
        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted hover:text-foreground">
            <input
              type="checkbox"
              checked={filters.deliveryOnly}
              onChange={(e) => update({ deliveryOnly: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Brand delivers it themselves
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted hover:text-foreground">
            <input
              type="checkbox"
              checked={filters.inStockOnly}
              onChange={(e) => update({ inStockOnly: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            In stock only
          </label>
        </div>
      </fieldset>

      {!isEmpty && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            commit(defaultFilters);
          }}
          className="self-start rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-white/30 hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  );

  return (
    <div>
      <div className="glass-card flex items-center gap-3 rounded-full px-5 py-3">
        <SearchIcon />
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search products, brands or cities…"
          aria-label="Search products, brands or cities"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {listings.length === 0
            ? "No products found"
            : `${listings.length} product${listings.length === 1 ? "" : "s"}`}
          {filterCount > 0 && ` · ${filterCount} filter${filterCount === 1 ? "" : "s"} active`}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-controls="filter-panel"
            className="rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-white/30 hover:text-foreground lg:hidden"
          >
            Filters{filterCount > 0 ? ` (${filterCount})` : ""}
          </button>

          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="sr-only sm:not-sr-only">Sort</span>
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortKey })}
              aria-label="Sort results"
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sticky, but scrollable in its own right: the facet list is taller
            than a short viewport, and a plain sticky block would put the
            delivery toggles and "Clear all" permanently out of reach. */}
        <aside
          id="filter-panel"
          className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-2"
        >
          {facetPanel}
        </aside>

        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.aside
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden lg:hidden"
            >
              <div className="glass-card rounded-2xl p-5">{facetPanel}</div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div>
          {listings.length === 0 ? (
            <div className="glass-card rounded-2xl px-6 py-16 text-center">
              <p className="font-display text-lg">Nothing matches that yet</p>
              <p className="mt-2 text-sm text-muted">
                Try a broader search, or clear a filter or two.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  commit(defaultFilters);
                }}
                className="mt-6 rounded-full bg-accent px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Reset search
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {listings.map((listing) => (
                <ListingCard key={listing.product.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-4 w-4 shrink-0 text-muted"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}
