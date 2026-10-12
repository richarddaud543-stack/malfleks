import { PARTNER } from "@/i18n/copy/partner";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";

import LiveProducts from "@/components/partner/LiveProducts";
import ShopDocumentsPanel from "@/components/partner/ShopDocumentsPanel";
import SubmissionTable from "@/components/partner/SubmissionTable";
import {
  countSubmissionsForPartner,
  listSubmissionsForPartner,
  requirePartner,
  type PartnerCounts,
  type PartnerSubmission,
} from "@/server/partners/portal";
import { listLiveProductsForBranch, type LiveProduct } from "@/server/partners/stock";
import { shopDocumentsView, type ShopDocumentsView } from "@/server/partners/verification";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: PARTNER[await pageLocale(params)].home.title, robots: { index: false, follow: false } };
}

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
export default async function PartnerPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = PARTNER[locale].home;
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

  // The shop's documents: what MalFleks has, what it still needs, and by when.
  // Its own read and its own failure, like the live products below.
  let documents: ShopDocumentsView | null = null;
  if (isBrand) documents = await shopDocumentsView(partner.partnerId).catch(() => null);
  const docCopy = copy.documents;
  const dateWords = (date: Date) =>
    date.toLocaleDateString(PARTNER[locale].dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">
        {isBrand ? copy.yourBranch : copy.yourCourier}
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
              {isBrand ? copy.customerOrders : copy.yourDeliveries}
            </Link>
          )}
          <Link
            href="/account"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
          >
            {copy.ownAccount}
          </Link>
        </div>
      </div>
      <p className="mt-3 text-muted">
        {partner.city}
        {partner.role === "owner" ? ` · ${copy.owner}` : ` · ${partner.role}`}
      </p>

      {suspended && (
        <div className="glass-card mt-8 rounded-2xl border border-red-600/40 px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            {copy.suspendedHeading}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {copy.suspendedBody}
          </p>
        </div>
      )}

      {isBrand && !partner.branchId && (
        <div className="glass-card mt-8 rounded-2xl px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            {copy.noBranchHeading}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {copy.noBranch.before}
            <strong>{copy.noBranch.strong}</strong>
            {copy.noBranch.after}
          </p>
        </div>
      )}

      {documents && !suspended && (
        <section
          aria-labelledby="documents-heading"
          className={`glass-card mt-8 rounded-2xl px-6 py-5 ${!documents.verifiedAt && documents.hidden ? "border border-red-600/40" : ""}`}
        >
          <h2 id="documents-heading" className="font-display text-lg font-medium">
            {docCopy.heading}
          </h2>
          {documents.verifiedAt ? (
            <p className="mt-2 text-sm text-muted">{docCopy.verified(dateWords(documents.verifiedAt))}</p>
          ) : documents.missing.length === 0 ? (
            <p className="mt-2 max-w-prose text-sm text-muted">{docCopy.waiting}</p>
          ) : (
            <>
              <p className="mt-2 max-w-prose text-sm text-muted">{documents.hidden ? docCopy.hidden : docCopy.needed}</p>
              {documents.deadline && !documents.hidden && (
                <p className="mt-2 max-w-prose text-sm font-medium">{docCopy.deadline(dateWords(documents.deadline))}</p>
              )}
              {documents.received.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  {docCopy.have}: {documents.received.length} / 3
                </p>
              )}
              {partner.role === "owner" ? (
                <ShopDocumentsPanel applicationId={partner.applicationId} missing={documents.missing} />
              ) : (
                <p className="mt-3 text-sm text-muted">{docCopy.ownerOnly}</p>
              )}
            </>
          )}
        </section>
      )}

      {!isBrand && !partner.agentId && (
        <div className="glass-card mt-8 rounded-2xl px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            {copy.noRoutingHeading}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {copy.noRoutingBody}
          </p>
        </div>
      )}

      {unavailable && (
        <div className="glass-card mt-8 rounded-2xl border border-red-600/40 px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            {copy.unavailableHeading}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {copy.unavailableBody}
          </p>
        </div>
      )}

      {isBrand && !unavailable && (
        <>
          <section aria-labelledby="counts-heading" className="mt-12">
            <h2 id="counts-heading" className="sr-only">
              {copy.glance}
            </h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Count label={copy.waiting} value={counts.pending} />
              <Count label={copy.live} value={counts.published} />
              <Count label={copy.sentBack} value={counts.rejected} />
            </dl>
          </section>

          <section aria-labelledby="listings-heading" className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2
                id="listings-heading"
                className="font-display text-lg font-medium tracking-tight"
              >
                {copy.everything}
              </h2>
              {canList && (
                <Link
                  href="/partner/products/new"
                  className="btn-pill btn-lime px-5 py-2 text-sm"
                >
                  {copy.list}
                </Link>
              )}
            </div>

            <div className="mt-5">
              <SubmissionTable submissions={submissions} locale={locale} />
            </div>
          </section>

          {liveProducts && (
            <LiveProducts products={liveProducts} canChange={!suspended} locale={locale} />
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
