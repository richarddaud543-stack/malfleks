export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-surface" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-lg bg-surface" />
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-2xl border border-border bg-surface"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
