import type { RecentServerError } from "@/server/error-log";

/**
 * The DB-backed fallback for real error monitoring — see
 * `src/server/error-log.ts` for why this exists instead of a Sentry
 * integration. A server component, not a client one: there is nothing here
 * to interact with, only to read, so it costs nothing to render straight
 * from the same `/admin` load that already fetches everything else.
 *
 * Quiet by design when there is nothing to show — an admin should never have
 * to learn to ignore a permanently-empty section to find the ones that
 * matter.
 */
export default function RecentErrorsPanel({
  errors,
}: {
  errors: RecentServerError[];
}) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="errors-heading"
      className="glass-card mt-12 rounded-2xl px-6 py-5"
    >
      <h2
        id="errors-heading"
        className="font-display text-lg font-medium tracking-tight"
      >
        Recent errors
        <span className="ml-2 text-sm font-normal text-muted tabular-nums">
          {errors.length}
        </span>
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Caught inside a write action that told its caller only
        &quot;something went wrong&quot; — this is what actually happened.
        Kept for 30 days, newest first.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {errors.map((error) => (
          <li
            key={error.id}
            className="rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="font-medium">{error.context}</span>
              <span className="text-xs text-muted">
                {error.createdAt.toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
            <p className="mt-1 break-words text-muted">{error.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
