import type { Metadata } from "next";
import Link from "next/link";

import LiveProducts from "@/components/partner/LiveProducts";
import SubmissionTable from "@/components/partner/SubmissionTable";
import {
  countSubmissionsForPartner,
  listSubmissionsForPartner,
  requirePartner,
  type PartnerCounts,
  type PartnerSubmission,
} from "@/server/partners/portal";
import { listLiveProductsForBranch, type LiveProduct } from "@/server/partners/stock";

export const metadata: Metadata = {
  title: "Your MalFleks listings",
  // One partner's private page, and — like `/admin` — a route that should not
  // announce itself. Absent from the sitemap too: a noindex URL advertised in
  // a sitemap tells crawlers two opposite things.
  robots: { index: false, follow: false },
};

/**
 * Never prerendered, for the reason `/account` and `/admin` state: with no
 * auth credentials at build time `verifySession()` short-circuits to `null`
 * *without reading cookies*, so a CI build would see a route with no dynamic
 * input, prerender it, and bake the redirect to /sign-in in permanently. The
 * build output would look perfectly healthy.
 */
export const dynamic = "force-dynamic";

/**
 * A partner's own dashboard.
 *
 * Everything on this page is scoped to one partner by `requirePartner()`, and
 * the queries take the `partnerId` it resolves from the session — never one
 * from the URL. That is the whole reason `portal.ts` exists apart from
 * `review.ts`: the admin sees every partner, a partner sees themselves.
 *
 * The page states two things partners otherwise learn by being confused:
 * approval is not publication, and a partner who has not been wired to a
 * branch yet cannot have anything published at all. Both are true in the
 * schema — `Partner.branchId` stays null until someone deliberately connects
 * it, and `canPublish` returns `no-branch` for exactly that case — so the
 * dashboard says so rather than letting submissions pile up unexplained.
 */
export default async function PartnerPage() {
  const { partner } = await requirePartner();

  const isBrand = partner.kind === "brand";
  const suspended = partner.status !== "active";
  const canList = isBrand && !suspended;

  let submissions: PartnerSubmission[] = [];
  let counts: PartnerCounts = { pending: 0, published: 0, rejected: 0 };
  let unavailable = false;

  try {
    [submissions, counts] = await Promise.all([
      listSubmissionsForPartner(partner.partnerId),
      countSubmissionsForPartner(partner.partnerId),
    ]);
  } catch {
    // Database unreachable. An empty table here would read as "your listings
    // are gone", which is a far worse lie than "we can't reach this".
    unavailable = true;
  }

  // What is actually on the shop for this branch, with the stock switch. Its
  // own read and its own failure: if it cannot be loaded the section is left
  // out, rather than taking the listings above down with it or showing an
  // empty list that reads as "nothing of yours is live".
  let liveProducts: LiveProduct[] | null = null;
  if (isBrand && partner.branchId) {
    liveProducts = await listLiveProductsForBranch(partner.branchId).catch(() => null);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">
        {isBrand ? "Your branch" : "Your courier account"}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">
          {partner.displayName}
        </h1>
        <div className="flex gap-4">
          {/* Orders sent to this branch — the reason a partner opens this page
              on a weekday morning. `/account` below is their own customer
              account, which is a different thing and was confusingly the only
              link here. */}
          {(isBrand || partner.agentId) && (
            <Link
              href="/partner/orders"
              className="text-sm text-accent underline decoration-border underline-offset-4"
            >
              {isBrand ? "Customer orders" : "Your deliveries"}
            </Link>
          )}
          <Link
            href="/account"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
          >
            Your own account
          </Link>
        </div>
      </div>
      <p className="mt-3 text-muted">
        {partner.city}
        {partner.role === "owner" ? " · Account owner" : ` · ${partner.role}`}
      </p>

      {suspended && (
        <div className="glass-card mt-8 rounded-2xl border border-red-600/40 px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            This account is suspended
          </h2>
          <p className="mt-2 text-sm text-muted">
            You can still see everything you have listed, but nothing new can be
            submitted until MalFleks lifts the suspension. Contact us if you think
            this is a mistake.
          </p>
        </div>
      )}

      {isBrand && !partner.branchId && (
        <div className="glass-card mt-8 rounded-2xl px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            Your branch isn&apos;t on the map yet
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Being approved as a partner and appearing in the catalogue are two
            separate steps, and a person at MalFleks does the second one by hand.
            Until your branch is connected, you can prepare listings here but{" "}
            <strong>nothing you submit can be published</strong> — a product has
            to belong to a branch for an order to reach anyone. We&apos;ll be in
            touch to confirm your address and opening hours first.
          </p>
        </div>
      )}

      {!isBrand && !partner.agentId && (
        <div className="glass-card mt-8 rounded-2xl px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            You aren&apos;t in the delivery routing yet
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Customers can only pick a courier MalFleks has added to the delivery
            routing, and that is a separate step from approving your account.
            Until it happens you will not be offered any jobs. We&apos;ll be in
            touch to confirm which cities you cover and how fast you deliver.
          </p>
        </div>
      )}

      {unavailable && (
        <div className="glass-card mt-8 rounded-2xl border border-red-600/40 px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            We can&apos;t reach your listings right now
          </h2>
          <p className="mt-2 text-sm text-muted">
            Nothing has been lost — this page could not read them. Try again in
            a moment.
          </p>
        </div>
      )}

      {isBrand && !unavailable && (
        <>
          <section aria-labelledby="counts-heading" className="mt-12">
            <h2 id="counts-heading" className="sr-only">
              Your listings at a glance
            </h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Count label="Waiting on review" value={counts.pending} />
              <Count label="Live on MalFleks" value={counts.published} />
              <Count label="Sent back" value={counts.rejected} />
            </dl>
          </section>

          <section aria-labelledby="listings-heading" className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2
                id="listings-heading"
                className="font-display text-lg font-medium tracking-tight"
              >
                Everything you&apos;ve submitted
              </h2>
              {canList && (
                <Link
                  href="/partner/products/new"
                  className="btn-pill btn-lime px-5 py-2 text-sm"
                >
                  List a product
                </Link>
              )}
            </div>

            <div className="mt-5">
              <SubmissionTable submissions={submissions} />
            </div>
          </section>

          {liveProducts && (
            <LiveProducts products={liveProducts} canChange={!suspended} />
          )}
        </>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl px-5 py-6">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}
