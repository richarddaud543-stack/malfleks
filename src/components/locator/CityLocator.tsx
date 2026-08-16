"use client";

import { useEffect, useMemo, useState } from "react";
import AgentCard from "@/components/delivery/AgentCard";
import LocatorBranchCard from "./LocatorBranchCard";
import TanzaniaMap from "./TanzaniaMap";
import {
  defaultLocatorFilters,
  filterBranches,
  getBrandOptions,
  getLocatorCities,
  paramsFromFilters,
  toggleBrand,
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
  initialFilters = defaultLocatorFilters,
}: {
  initialFilters?: LocatorFilters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const { city, brandIds } = filters;

  useEffect(() => {
    const query = paramsFromFilters(filters).toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname
    );
  }, [filters]);

  const cities = useMemo(() => getLocatorCities(brandIds), [brandIds]);
  const brandOptions = useMemo(() => getBrandOptions(city), [city]);
  const results = useMemo(() => filterBranches(filters), [filters]);

  // Agent coverage is per city, so with no city chosen we show all four.
  const coverage = city ? cities.filter((c) => c.name === city) : cities;
  const isFiltered = city !== null || brandIds.length > 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-12">
      <section
        aria-labelledby="locator-map-heading"
        className="lg:sticky lg:top-24 lg:self-start"
      >
        <h2 id="locator-map-heading" className="sr-only">
          Map of Tanzania — choose a city
        </h2>

        <TanzaniaMap
          cities={cities}
          selectedCity={city}
          onSelect={(next) => setFilters((f) => ({ ...f, city: next }))}
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Marker size follows how many branches a city has.
          </p>
          {city !== null && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, city: null }))}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-foreground/20 hover:text-foreground"
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
                          borderColor: brand.accentColor,
                          background: `${brand.accentColor}22`,
                        }
                      : undefined
                  }
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
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

        {isFiltered && (
          <button
            type="button"
            onClick={() => setFilters(defaultLocatorFilters)}
            className="mt-5 rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            Clear filters
          </button>
        )}
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
              No branch of that brand in this city — try another city, or clear
              the brand filter.
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
              <li key={entry.branch.id}>
                <LocatorBranchCard entry={entry} />
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
