import LoadingShimmer from "@/components/motion/LoadingShimmer";

/**
 * The global route-transition fallback (any page without its own nested
 * `loading.tsx` — e.g. `/locator` has one, this is what covers the rest).
 * Previously a flat `animate-pulse` skeleton: same opacity blinking on every
 * block at once, which reads as "frozen" more than "working." Swapped for a
 * shimmer sweep (`LoadingShimmer`) staggered left-to-right, top-to-bottom —
 * closer to how the content it stands in for actually arrives.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-6xl px-5 py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <LoadingShimmer className="h-10 w-64 rounded-lg" delay={0} />
      <LoadingShimmer
        className="mt-3 h-4 w-96 max-w-full rounded-lg"
        delay={0.1}
      />
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <LoadingShimmer
            key={i}
            className="h-48 rounded-2xl border border-border"
            delay={i * 0.12}
          />
        ))}
      </div>
    </div>
  );
}
