import { PLACES } from "@/i18n/copy/places";
import { getLocale } from "@/i18n/server";
import LoadingShimmer from "@/components/motion/LoadingShimmer";

/**
 * The only route-transition fallback left in the app, and the comment explaining
 * why the others went.
 *
 * There used to be one at `src/app/loading.tsx` covering every route, plus one
 * over the whole `/brands` subtree. Both were removed on 2026-09-01, because of
 * what a `loading.tsx` actually *is*: a Suspense boundary. The moment its
 * fallback renders the response has begun streaming, the HTTP status is
 * committed as `200`, and a `notFound()` thrown afterwards can only produce a
 * soft 404 — a page reading "Product not found" over a success status. Next's
 * own documentation states the trade plainly
 * (`01-app/03-api-reference/03-file-conventions/loading.md`, "Status Codes"):
 * to return a real 404 the resource has to be checked before the response
 * streams.
 *
 * A marketplace produces dead URLs forever — a partner delists a product, a
 * branch closes, a whole catalogue is emptied — so those routes have to be able
 * to answer 404 honestly. Hence the rule:
 *
 * **A route may have a `loading.tsx` only if it never calls `notFound()` or
 * `redirect()`.**
 *
 * `/products/[id]`, `/brands/[slug]`, the branch pages and `/delivery/[productId]`
 * all call `notFound()`; `/admin` and `/partner` call both. On those two it is a
 * small security property as well as tidiness — a soft 404 would answer `200`
 * where a genuinely unknown URL answers `404`, and comparing the two would tell
 * anyone that the route exists.
 *
 * `/agents` qualifies: it awaits `searchParams` and queries every courier, so it
 * is dynamic and worth a fallback, and it cannot 404 — an unknown `?city=` is a
 * filter that matches nothing, not a missing page.
 *
 * `/brands` (the listing) is a static page inside the `(index)` route group,
 * which exists solely so that this kind of boundary can never again be placed
 * where it would cover `/brands/[slug]`.
 */
export default function AgentsLoading() {
  return (
    <div
      className="mx-auto max-w-4xl px-5 py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{PLACES[getLocale()].agents.loading}</span>
      <LoadingShimmer className="h-10 w-64 rounded-lg" delay={0} />
      <LoadingShimmer
        className="mt-3 h-4 w-96 max-w-full rounded-lg"
        delay={0.1}
      />
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingShimmer
            key={i}
            className="h-28 rounded-2xl border border-border"
            delay={i * 0.12}
          />
        ))}
      </div>
    </div>
  );
}
