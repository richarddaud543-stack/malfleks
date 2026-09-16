/**
 * Tells the public shop deployment to refresh its cached catalogue pages.
 *
 * ## Why this exists
 *
 * The admin console and the shop are the same codebase deployed as two
 * separate Vercel projects (`malfleks-admin` and `malfleks`, see
 * `claude/soko-admin-site.md`), each with its own independent Next.js cache.
 * `revalidatePath`, called from a Server Action running on the admin
 * deployment, can only ever clear *the admin deployment's own* cache — it has
 * no way to reach across a project boundary and touch the shop's. Every admin
 * action that changes what a customer sees (publishing a product, putting a
 * partner on the map) was calling `revalidatePath` believing it refreshed the
 * live site, when it was refreshing a cache nobody browses. Confirmed live
 * 2026-09-16: a product approved on the console did not appear on
 * malfleks.vercel.app, and the code-level cause was exactly this.
 *
 * The fix is the shape that exists for this class of problem: an
 * authenticated HTTP call from the admin deployment to a revalidation
 * endpoint on the shop deployment, so `revalidatePath` runs in the process
 * that actually owns the cache customers see. See `/api/revalidate` (shop
 * side, `src/app/api/revalidate/route.ts`) for the other half.
 *
 * ## Fails open, on purpose, like `sendNotification`
 *
 * `MALFLEKS_PUBLIC_SITE_URL` and `MALFLEKS_REVALIDATE_SECRET` are optional.
 * Unset — local dev, CI, preview deployments, or a shop-only deployment with
 * no separate admin project — this silently does nothing, which is correct:
 * the local `revalidatePath` calls beside it already cover the
 * single-deployment case. A network failure here is swallowed the same way,
 * deliberately: the catalogue write already succeeded in the database by the
 * time this runs, and an admin should not see "unavailable" on a change that
 * actually went through because a best-effort ping timed out. Worst case
 * without it, the shop's page catches up next time anything else revalidates
 * it, or at the next deploy — not silently wrong forever.
 */
export async function notifyPublicSiteOfCatalogueChange(): Promise<void> {
  const url = process.env.MALFLEKS_PUBLIC_SITE_URL?.trim();
  const secret = process.env.MALFLEKS_REVALIDATE_SECRET?.trim();
  if (!url || !secret) return;

  try {
    await fetch(`${url.replace(/\/+$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      // Best-effort and on the critical path of an admin click — short and
      // bounded rather than left to the platform's own (much longer) default.
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort. See module doc: the write already succeeded without this.
  }
}
