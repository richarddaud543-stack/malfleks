"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import AgentCard from "@/components/delivery/AgentCard";
import { borderAccent } from "@/lib/accent";
import LocatorBranchCard from "./LocatorBranchCard";
import TanzaniaMap from "./TanzaniaMap";
import {
  defaultLocatorFilters,
  filterBranches,
  getBrandOptions,
  getLocatorCities,
  paramsFromFilters,
  toggleBrand,
  type LocatorData,
  type LocatorFilters,
} from "./locator";

/**
 * The locator proper: a map, two filters and the branch list they drive.
 *
 * Filter state lives here rather than in the URL — the whole dataset is
 * already in the bundle, so a route update would only add latency to a click.
 * The URL is kept in step afterwards with the native history API (which
 * Next.js syncs into `useSearchParams`) purely so a chosen city stays
 * shareable; `initialFilters` is how a shared link comes back in.
 */
export default function CityLocator({
  data,
  initialFilters = defaultLocatorFilters,
}: {
  data: LocatorData;
  initialFilters?: LocatorFilters;
}) {
  const reduceMotion = useReducedMotion();
  const [filters, setFilters] = useState(initialFilters);
  const { city, brandIds, q = "" } = filters;

  // The city a hovered/focused marker or branch card is previewing — read by
  // both TanzaniaMap and the branch list below so the two halves highlight
  // each other instead of reading as two lists that happen to share a page.
  const [pairedCity, setPairedCity] = useState<string | null>(null);

  useEffect(() => {
    const query = paramsFromFilters(filters).toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname
    );
  }, [filters]);

  // The search field joins the same filter object city/brand already use, so
  // it rides the existing URL-sync effect above rather than needing one of
  // its own — narrowing is live because there's no debounce to wait out: no
  // navigation happens here, only a `history.replaceState`.
  const cities = useMemo(
    () => getLocatorCities(data, brandIds, q),
    [data, brandIds, q]
  );
  const brandOptions = useMemo(
    () => getBrandOptions(data, city, q),
    [data, city, q]
  );
  const results = useMemo(() => filterBranches(data, filters), [data, filters]);

  // Agent coverage is per city, so with no city chosen we show all four.
  const coverage = city ? cities.filter((c) => c.name === city) : cities;
  const isFiltered = city !== null || brandIds.length > 0 || q.trim() !== "";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-12">
      <section
        aria-labelledby="locator-map-heading"
        className="lg:sticky lg:top-24 lg:self-start"
      >
        <h2 id="locator-map-heading" className="sr-only">
          Map of Tanzania — choose a city
        </h2>

        {/* Google-Maps-style floating search over the map itself, rather than
            a field bolted on beside it — see the note on TanzaniaMap for why
            the map stays a stylised outline rather than becoming a real one. */}
        {/* The padding is headroom for the floating field, not decoration:
            the map's northern markers (Mwanza especially) sit high enough in
            the viewBox that the pill lands right on top of them and clips
            one. Reserving the band here — rather than nudging the field up
            out of the way — keeps the field on the map where it belongs and
            moves the markers, which have room below, instead. */}
        <div className="relative pt-16">
          <TanzaniaMap
            cities={cities}
            selectedCity={city}
            pairedCity={pairedCity}
            onSelect={(next) => setFilters((f) => ({ ...f, city: next }))}
            onHoverCity={setPairedCity}
          />

          <div className="absolute inset-x-2.5 top-2.5 sm:inset-x-4 sm:top-4">
            <div className="glass-card shadow-float flex items-center gap-2.5 rounded-full px-4 py-2.5">
              <SearchIcon />
              <input
                type="search"
                value={q}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, q: e.target.value }))
                }
                placeholder="Search brand, city or branch…"
                aria-label="Search branches by brand, city or branch name"
                // `type="search"` earns the right semantics and the right
                // mobile keyboard, but WebKit/Blink also draw their own
                // unlabelled clear glyph inside the field — which sat next
                // to ours, two ✕ controls doing the same job. Ours stays:
                // it is labelled for screen readers and renders in Firefox
                // too, where the native decoration doesn't exist at all.
                className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, q: "" }))}
                  aria-label="Clear search"
                  className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
                >
                  <ClearIcon />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Marker size follows how many branches a city has.
          </p>
          {city !== null && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, city: null }))}
              className="min-h-10 rounded-full border border-border px-3.5 py-1 text-sm text-muted transition-colors hover:border-foreground/20 hover:text-foreground"
            >
              All cities
            </button>
          )}
        </div>

        <fieldset className="mt-8 border-0 p-0">
          <legend className="text-xs font-medium tracking-wide text-muted uppercase">
            Brand
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {brandOptions.map(({ brand, count }) => {
              const isSelected = brandIds.includes(brand.id);
              const isEmpty = count === 0 && !isSelected;

              return (
                <button
                  key={brand.id}
                  type="button"
                  disabled={isEmpty}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      brandIds: toggleBrand(f.brandIds, brand.id),
                    }))
                  }
                  style={
                    isSelected
                      ? {
                          // The fill keeps the brand's own colour; only the
                          // border is corrected, because the border is the
                          // part that has to be seen. See lib/accent.ts.
                          borderColor: borderAccent(brand.accentColor),
                          background: `${brand.accentColor}22`,
                        }
                      : undefined
                  }
                  className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    isSelected
                      ? "text-foreground"
                      : isEmpty
                        ? "cursor-not-allowed border-border/50 text-muted/40"
                        : "border-border text-muted hover:border-foreground/20 hover:text-foreground"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: brand.accentColor }}
                  />
                  {brand.name}
                  <span className="tabular-nums opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <AnimatePresence>
          {isFiltered && (
            <motion.button
              type="button"
              onClick={() => setFilters(defaultLocatorFilters)}
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="mt-5 min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-foreground/20 hover:text-foreground"
            >
              Clear filters
            </motion.button>
          )}
        </AnimatePresence>
      </section>

      <div>
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {results.length === 0
            ? "No branches match"
            : `${results.length} branch${results.length === 1 ? "" : "es"}`}
          {city ? ` in ${city}` : " across Tanzania"}
        </p>

        {results.length === 0 ? (
          <div className="glass-card mt-4 rounded-2xl px-6 py-14 text-center">
            <p className="font-display text-lg">Nothing here yet</p>
            <p className="mt-2 text-sm text-muted">
              No branch matches that combination — try another city or brand,
              or clear the search.
            </p>
            <button
              type="button"
              onClick={() => setFilters(defaultLocatorFilters)}
              className="mt-6 rounded-full bg-accent px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Show every branch
            </button>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {results.map((entry) => (
              <li
                key={entry.branch.id}
                // React's onFocus/onBlur bubble (unlike the native DOM
                // events), so this fires as focus moves onto or off the
                // card's link inside — no separate handler needed there.
                onMouseEnter={() => setPairedCity(entry.branch.city)}
                onMouseLeave={() =>
                  setPairedCity((c) => (c === entry.branch.city ? null : c))
                }
                onFocus={() => setPairedCity(entry.branch.city)}
                onBlur={() =>
                  setPairedCity((c) => (c === entry.branch.city ? null : c))
                }
              >
                <LocatorBranchCard
                  entry={entry}
                  active={pairedCity === entry.branch.city}
                />
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="locator-agents-heading" className="mt-14">
          <h2
            id="locator-agents-heading"
            className="font-display text-xl font-medium tracking-tight"
          >
            Who delivers{" "}
            <span className="font-accent-serif text-accent italic">
              {city ? `in ${city}` : "where"}
            </span>
          </h2>
          <p className="mt-2 text-sm text-muted">
            Branches marked “Local agent delivery” are handed to one of these
            couriers.
          </p>

          {coverage.map((entry) => (
            <div key={entry.name} className="mt-6">
              {/* The city heading is redundant when you have already picked
                  one, but a screen reader still needs the group labelled. */}
              <h3
                className={`text-xs font-medium tracking-wide text-muted uppercase ${
                  city ? "sr-only" : ""
                }`}
              >
                {entry.name}
              </h3>
              {entry.agents.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No courier covers {entry.name} yet.
                </p>
              ) : (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {entry.agents.map((agent) => (
                    <li key={agent.id}>
                      <AgentCard agent={agent} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
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

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
