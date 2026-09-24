import { isDatabaseConfigured } from "@/server/db/database-url";

/**
 * Prerendered route parameters, or none when there is no database to read
 * them from.
 *
 * ## The failure this exists to stop
 *
 * Four pages call `generateStaticParams`, and every one of them queries
 * Postgres. `next build` runs them, so the build needs a live connection
 * string -- and on the `malfleks-admin` Vercel project `DATABASE_URL` is
 * scoped to Production only. Every branch build there therefore died at
 * exactly the same place:
 *
 * ```
 * Error: DATABASE_URL is not set.
 *   at resolveDatabaseUrl (src/server/db/database-url.ts:31:9)
 * > Build error occurred
 * Error: Failed to collect page data for /brands/[slug]/branches/[branchId]
 * ```
 *
 * That is not a missing variable so much as a design assumption: that
 * building and running need the same inputs. They do not. Prerendering is an
 * optimisation -- with no params returned, Next.js renders these routes on
 * first request instead, which is what a preview deployment wants anyway.
 *
 * ## Why it checks configuration, not reachability
 *
 * Swallowing a failed *query* would hide a real outage behind a site that
 * quietly stopped prerendering. Swallowing a missing *variable* hides
 * nothing: the deployment either has a database later, at request time, or
 * it does not, and then it fails where a person is watching. So the check is
 * `isDatabaseConfigured()` and never a try/catch around the query.
 */
export async function prerenderParams<T>(
  collect: () => Promise<T[]>,
): Promise<T[]> {
  if (!isDatabaseConfigured()) return [];
  return collect();
}
