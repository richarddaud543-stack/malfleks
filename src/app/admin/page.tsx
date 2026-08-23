import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/dal";
import {
  listPendingApplications,
  listReviewedApplications,
} from "@/server/partners/review";
import { getAllBrands } from "@/server/repositories";
import ApplicationReviewCard from "@/components/admin/ApplicationReviewCard";

export const metadata: Metadata = {
  title: "Partner applications",
  // Not in the sitemap either, matching /account: a noindex URL advertised in
  // a sitemap tells crawlers two opposite things.
  robots: { index: false, follow: false },
};

/**
 * Never prerendered, for the same reason `/account` is not: `verifySession()`
 * short-circuits to `null` when no Admin credentials are present, *without*
 * reading cookies. A CI build running before the runtime secrets exist would
 * see a route with no dynamic input, prerender it, and bake the redirect in
 * permanently — and the build output would look healthy.
 */
export const dynamic = "force-dynamic";

/**
 * The admin review queue.
 *
 * `requireAdmin()` sends a signed-out visitor to sign in and gives a signed-in
 * non-admin a 404, so the route does not confirm its own existence to someone
 * who may not use it. The actions this page renders re-check admin themselves —
 * a Server Action is a public endpoint, and the page is not its gate.
 */
export default async function AdminPage() {
  await requireAdmin();

  const [pending, reviewed, brands] = await Promise.all([
    listPendingApplications(),
    listReviewedApplications(),
    getAllBrands(),
  ]);

  const brandNames = Object.fromEntries(brands.map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">Admin</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        Partner applications
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Every application is decided here by a person. Approving creates the
        partner&apos;s account and lets them sign in — it does{" "}
        <strong>not</strong> put a branch on the locator or a courier in the
        routing. That is a separate, deliberate step.
      </p>

      <section aria-labelledby="pending-heading" className="mt-12">
        <h2
          id="pending-heading"
          className="font-display text-lg font-medium tracking-tight"
        >
          Waiting on you
          <span className="ml-2 text-sm font-normal text-muted tabular-nums">
            {pending.length}
          </span>
        </h2>

        {pending.length === 0 ? (
          <div className="glass-card mt-5 rounded-2xl px-6 py-12 text-center">
            <p className="font-display text-lg font-medium">Nothing waiting</p>
            <p className="mt-2 text-sm text-muted">
              New applications from <code>/apply</code> land here.
            </p>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-5">
            {pending.map((application) => (
              <ApplicationReviewCard
                key={application.id}
                application={application}
                brandNames={brandNames}
              />
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section aria-labelledby="decided-heading" className="mt-14">
          <h2
            id="decided-heading"
            className="font-display text-lg font-medium tracking-tight"
          >
            Recently decided
          </h2>
          <ul className="mt-5 flex flex-col gap-3">
            {reviewed.map((application) => (
              <li
                key={application.id}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-border bg-surface-2 px-5 py-3.5"
              >
                <span className="text-sm font-medium">
                  {application.businessName}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {application.decisionNote && (
                    <span className="italic">{application.decisionNote}</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium tracking-wide uppercase ${
                      application.status === "approved"
                        ? "bg-accent/10 text-accent"
                        : "bg-red-600/10 text-red-600"
                    }`}
                  >
                    {application.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
