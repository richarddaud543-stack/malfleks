import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/dal";
import {
  listPendingApplications,
  listReviewedApplications,
} from "@/server/partners/review";
import { getAllBrands } from "@/server/repositories";
import ApplicationReviewCard from "@/components/admin/ApplicationReviewCard";
import NotificationCheck from "@/components/admin/NotificationCheck";
import PartnerActivationCard from "@/components/admin/PartnerActivationCard";
import {
  listActivatablePartners,
  listBrandsForActivation,
} from "@/server/partners/activation";

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

  // Read on the server so the banner reflects this deployment rather than
  // anyone's memory of what they configured. Safe to show an admin: which
  // provider, and the address Soko notifies — never the key.
  const { isEmailConfigured, notifyAddress, notifyProvider } = await import(
    "@/server/notify/email"
  );
  const emailConfigured = isEmailConfigured();
  const emailProvider = notifyProvider();
  const emailTo = notifyAddress();

  const [pending, reviewed, brands, waitingToGoLive, catalogueBrands] =
    await Promise.all([
      listPendingApplications(),
      listReviewedApplications(),
      getAllBrands(),
      // Approved but not yet in the catalogue. Before this section existed,
      // approving was the end of the road: Partner.branchId stayed null
      // forever, canPublish answered "no-branch" for everything they
      // submitted, and no courier ever entered the routing.
      listActivatablePartners(),
      listBrandsForActivation(),
    ]);

  const brandNames = Object.fromEntries(brands.map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">Admin</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">
          Partner applications
        </h1>
        <div className="flex gap-4">
          <Link
            href="/admin/submissions"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
          >
            Product submissions
          </Link>
          <Link
            href="/admin/orders"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
          >
            Orders
          </Link>
        </div>
      </div>
      <p className="mt-3 max-w-xl text-muted">
        Every application is decided here by a person. Approving creates the
        partner&apos;s account and lets them sign in — it does{" "}
        <strong>not</strong> put a branch on the locator or a courier in the
        routing. That is a separate, deliberate step.
      </p>

      {waitingToGoLive.length > 0 && (
        <section aria-labelledby="golive-heading" className="mt-12">
          <h2
            id="golive-heading"
            className="font-display text-lg font-medium tracking-tight"
          >
            Approved, waiting to go live
            <span className="ml-2 text-sm font-normal text-muted tabular-nums">
              {waitingToGoLive.length}
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            These partners can sign in, but customers cannot see them yet. A
            brand branch cannot have a single product published until it is on
            the map, and a courier is offered to nobody until it is in the
            routing — so this list is the last step between an approval and a
            working listing.
          </p>
          <ul className="mt-5 flex flex-col gap-5">
            {waitingToGoLive.map((partner) => (
              <PartnerActivationCard
                key={partner.partnerId}
                partner={partner}
                brands={catalogueBrands}
              />
            ))}
          </ul>
        </section>
      )}

      <NotificationCheck
        configured={emailConfigured}
        provider={emailProvider}
        to={emailTo}
      />

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
