"use client";

import { MAP_SIZE, lakeVictoriaPath, projectPercent, tanzaniaPath } from "./geo";
import type { LocatorCity } from "./locator";

/** Marker diameter as a share of the map's width, so a wide map gets bigger
 *  pins; clamped at both ends to stay tappable on a phone and sane on a
 *  desktop. */
const MIN_MARKER = 9.5;
const MAX_MARKER = 15;

export default function TanzaniaMap({
  cities,
  selectedCity,
  onSelect,
}: {
  cities: LocatorCity[];
  selectedCity: string | null;
  onSelect: (city: string | null) => void;
}) {
  // Sizing is relative to the busiest city rather than an absolute scale, so
  // the map still reads when a brand filter thins every city out.
  const busiest = Math.max(1, ...cities.map((c) => c.branchCount));

  // `@container` so marker sizes track the map's own width rather than the
  // viewport's — the map sits in a sidebar on desktop, full-bleed on mobile.
  return (
    <div className="@container relative w-full">
      <svg
        viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
        className="block h-auto w-full"
        // Every fact the map carries is also in the buttons and the list
        // below, so the drawing itself is decorative to a screen reader.
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="tz-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="55%" stopColor="var(--accent-2)" stopOpacity="0.13" />
            <stop offset="100%" stopColor="var(--accent-3)" stopOpacity="0.16" />
          </linearGradient>
          <filter id="tz-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={tanzaniaPath}
          fill="var(--accent)"
          opacity="0.18"
          filter="url(#tz-glow)"
        />
        <path
          d={tanzaniaPath}
          fill="url(#tz-fill)"
          stroke="var(--accent)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d={lakeVictoriaPath}
          fill="var(--background)"
          fillOpacity="0.55"
          stroke="var(--accent)"
          strokeOpacity="0.3"
          strokeWidth="1"
        />
      </svg>

      {cities.map((city) => {
        const { left, top } = projectPercent(city.center);
        const isSelected = selectedCity === city.name;
        // Square-rooted so the marker's *area* tracks the branch count; a city
        // with twice the branches should not look four times the size.
        const weight =
          busiest === 1 ? 1 : Math.sqrt(city.branchCount) / Math.sqrt(busiest);
        const size = MIN_MARKER + weight * (MAX_MARKER - MIN_MARKER);
        const isEmpty = city.branchCount === 0 && !isSelected;

        return (
          <button
            key={city.name}
            type="button"
            // Named explicitly rather than left to accumulate from the child
            // spans: browsers join those with whitespace, which put a stray
            // space before the comma ("Dodoma , 4 branches").
            aria-label={`${city.name}, ${city.branchCount} ${
              city.branchCount === 1 ? "branch" : "branches"
            }`}
            aria-pressed={isSelected}
            disabled={isEmpty}
            onClick={() => onSelect(isSelected ? null : city.name)}
            style={{ left: `${left}%`, top: `${top}%` }}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 disabled:cursor-not-allowed"
          >
            <span
              aria-hidden="true"
              style={{
                width: `clamp(2.25rem, ${size}cqw, 3.75rem)`,
                height: `clamp(2.25rem, ${size}cqw, 3.75rem)`,
              }}
              className={`flex items-center justify-center rounded-full border text-sm font-medium tabular-nums transition-all duration-300 ${
                isSelected
                  ? "border-accent bg-accent text-background shadow-[0_0_28px_-2px_var(--accent)]"
                  : isEmpty
                    ? "border-border/60 bg-surface/60 text-muted/40"
                    : "border-accent/50 bg-surface/90 text-foreground shadow-[0_0_20px_-6px_var(--accent)] group-hover:scale-110 group-hover:border-accent"
              }`}
            >
              {city.branchCount}
            </span>
            <span
              aria-hidden="true"
              className={`rounded-full bg-background/70 px-1.5 text-[11px] whitespace-nowrap backdrop-blur-sm transition-colors ${
                isSelected ? "text-accent" : isEmpty ? "text-muted/40" : "text-muted"
              }`}
            >
              {city.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
