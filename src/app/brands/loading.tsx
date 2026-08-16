/**
 * Route-specific replacement for the root `src/app/loading.tsx` skeleton
 * (Atlas's file, generic across every route) — this one mirrors `BrandCard`
 * and `BrandCatalog`'s actual anatomy instead of a blank rounded box, so the
 * loading state previews the shape of what's arriving (logo tile, heading,
 * category eyebrow, delivery-mix pill, two lines of description) rather than
 * just a generic placeholder. Skeleton screens that echo the real layout
 * reduce perceived layout shift versus a content-agnostic block.
 *
 * `animate-pulse` is Tailwind's own utility; its `prefers-reduced-motion`
 * guard lives once, app-wide, in `globals.css` rather than repeated here —
 * see the comment there.
 */
export default function BrandsLoading() {
  return (
    <div
      className="mx-auto max-w-6xl px-3 py-12 sm:px-6 sm:py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading brands…</span>

      <div className="h-12 w-72 max-w-full animate-pulse rounded-lg bg-surface" />
      <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-lg bg-surface" />

      <div className="panel mt-10 p-4 sm:p-8">
        <div className="flex flex-wrap gap-2">
          {["All", "Automotive", "Electronics", "Telecom"].map((label, i) => (
            <div
              key={label}
              className="h-8 w-24 animate-pulse rounded-full border border-border bg-surface-2"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="glass-card rounded-[1.75rem] p-6"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <div className="h-16 w-16 animate-pulse rounded-2xl border border-border bg-surface" />
              <div className="mt-5 h-5 w-2/3 animate-pulse rounded-md bg-surface" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded-md bg-surface" />
              <div className="mt-3 h-6 w-2/5 animate-pulse rounded-full bg-surface" />
              <div className="mt-4 h-3 w-full animate-pulse rounded-md bg-surface" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded-md bg-surface" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
