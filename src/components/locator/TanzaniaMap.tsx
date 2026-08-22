"use client";

import { motion, useReducedMotion } from "motion/react";
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
  pairedCity = null,
  onSelect,
  onHoverCity,
}: {
  cities: LocatorCity[];
  selectedCity: string | null;
  /** The city the results panel currently has hovered or focused — lets a
   *  marker preview that pairing without actually filtering anything. See
   *  the matching wiring in CityLocator and LocatorBranchCard. */
  pairedCity?: string | null;
  onSelect: (city: string | null) => void;
  onHoverCity?: (city: string | null) => void;
}) {
  const reduceMotion = useReducedMotion();

  // Sizing is relative to the busiest city rather than an absolute scale, so
  // the map still reads when a brand filter thins every city out.
  const busiest = Math.max(1, ...cities.map((c) => c.branchCount));

  // `@container` so marker sizes track the map's own width rather than the
  // viewport's — the map sits in a sidebar on desktop, full-bleed on mobile.
  // `perspective-1000` (existing globals.css utility) is what gives the
  // selected-marker drop below real depth: `rotateX` only reads as 3D when
  // an ancestor has established a perspective, otherwise it's a flat skew.
  return (
    <div className="@container perspective-1000 relative w-full">
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
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
            <stop offset="55%" stopColor="var(--accent-2)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent-3)" stopOpacity="0.13" />
          </linearGradient>
          {/* A blurred, accent-tinted copy of the outline used to read as a
              bloom against the old near-black page — the bright colour
              "glowing" out of the dark. Against white that same technique
              just smears colour past the border, so it's redrawn here in
              --foreground instead: a soft, low-opacity ink shadow, the same
              language `.shadow-float`/`.glass-card` use to lift a shape off
              a light ground rather than light it up. */}
          <filter id="tz-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={tanzaniaPath}
          fill="var(--foreground)"
          opacity="0.07"
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
          fillOpacity="0.9"
          stroke="var(--accent)"
          strokeOpacity="0.4"
          strokeWidth="1"
        />
      </svg>

      {cities.map((city) => {
        const { left, top } = projectPercent(city.center);
        const isSelected = selectedCity === city.name;
        // A marker already fully selected has nothing left to preview.
        const isPaired = !isSelected && pairedCity === city.name;
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
            // Pairing previews the same city the click would select, from
            // both a real pointer hover and a keyboard focus — no behaviour
            // here is hover-only, it just also happens to respond to hover.
            onMouseEnter={() => onHoverCity?.(city.name)}
            onMouseLeave={() => onHoverCity?.(null)}
            onFocus={() => onHoverCity?.(city.name)}
            onBlur={() => onHoverCity?.(null)}
            style={{ left: `${left}%`, top: `${top}%` }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 disabled:cursor-not-allowed"
          >
            {/* Re-keyed on `isSelected` so Motion mounts a fresh instance the
                moment a marker is picked (or let go of) and replays `initial`
                — the "considered select/drop" the marker needed, rather than
                a continuous loop. `rotateX` is what makes it a 3D drop rather
                than a plain slide: the pin tips forward out of the map's
                perspective and rights itself, instead of just falling
                straight down. */}
            <motion.span
              key={`${city.name}-${isSelected}`}
              aria-hidden="true"
              initial={
                reduceMotion || !isSelected
                  ? false
                  : { rotateX: -65, y: -18, scale: 0.55, opacity: 0.5 }
              }
              animate={{
                rotateX: 0,
                y: 0,
                scale: isPaired ? 1.1 : 1,
                opacity: 1,
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }
              }
              style={{
                width: `clamp(2.25rem, ${size}cqw, 3.75rem)`,
                height: `clamp(2.25rem, ${size}cqw, 3.75rem)`,
              }}
              className={`flex items-center justify-center rounded-full border text-sm font-medium tabular-nums transition-colors duration-300 ${
                isSelected
                  ? "border-accent bg-accent text-background shadow-[0_0_24px_-6px_var(--accent)]"
                  : isEmpty
                    ? "border-border/60 bg-background/60 text-muted/40"
                    // /60, not /50: at 50% over this fill the resting outline
                    // measures 2.62:1 and misses WCAG 1.4.11's 3:1, and the
                    // outline is the whole boundary of the control. /60 is
                    // 3.31:1 — the smallest step on Tailwind's scale that
                    // clears it, so the marker stays as faint as it was drawn
                    // to be. Empty markers keep /60 of --border because an
                    // inactive control is exempt.
                    : `bg-background/90 text-foreground shadow-[0_0_16px_-8px_var(--accent)] ${
                        isPaired ? "border-accent" : "border-accent/60"
                      }`
              }`}
            >
              {city.branchCount}
            </motion.span>
            <span
              aria-hidden="true"
              className={`rounded-full bg-background/70 px-1.5 text-[11px] whitespace-nowrap backdrop-blur-sm transition-colors ${
                isSelected || isPaired
                  ? "text-accent"
                  : isEmpty
                    ? "text-muted/40"
                    : "text-muted"
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
