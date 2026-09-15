import {
  MAP_SIZE,
  lakeVictoriaPath,
  projectPercent,
  tanzaniaPath,
  type LatLng,
} from "./geo";

/**
 * The same Tanzania outline `TanzaniaMap` draws, with a single moving marker
 * instead of a city grid — one delivery's most recently reported position,
 * not the whole locator.
 *
 * Deliberately its own component rather than a `TanzaniaMap` prop: that
 * component's markers are real `<button>`s wired to a `cities` list and a
 * selection callback, none of which a tracking view has any use for. Sharing
 * `geo.ts`'s projection and paths is what actually matters — the two maps
 * must never draw the country in two subtly different places — and both get
 * that by importing the same module.
 */
export default function OrderTrackingMap({
  position,
}: {
  /** The courier's last reported position, or `null` before any ping exists. */
  position: LatLng | null;
}) {
  const marker = position ? projectPercent(position) : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
        className="block h-auto w-full"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={tanzaniaPath}
          fill="var(--accent)"
          fillOpacity="0.12"
          stroke="var(--accent)"
          strokeOpacity="0.5"
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

      {marker && (
        <span
          aria-hidden="true"
          style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2"
        >
          <span className="absolute inset-0 -m-2 animate-ping rounded-full bg-accent/40" />
          <span className="relative block h-3.5 w-3.5 rounded-full border-2 border-background bg-accent shadow-[0_0_12px_-2px_var(--accent)]" />
        </span>
      )}
    </div>
  );
}
