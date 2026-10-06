import { ACCOUNT } from "@/i18n/copy/account";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth/dal";
import {
  listOrderRequestsForCustomer,
  type SavedOrderRequest,
} from "@/server/orders/saved-requests";
import { checkoutStatesForCustomer, type AccountOrderStatus } from "@/server/orders/checkout";
import { deliveryCodesForCustomer } from "@/server/orders/delivery-code";
import { partnerForUser } from "@/server/partners/portal";
import SavedRequestCard from "@/components/account/SavedRequestCard";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const copy = ACCOUNT[await pageLocale(params)].page;
  return { title: copy.title, description: copy.description, robots: { index: false, follow: false } };
}

/**
 * Never prerendered. This is stated rather than inferred, and the difference is
 * not academic: `verifySession()` short-circuits to `null` when no Admin
 * credentials are present, *without* reading cookies. A build that runs before
 * the runtime secrets exist — which is the normal shape of a CI build — would
 * therefore see a route with no dynamic input, prerender it, and bake in the
 * redirect to /sign-in permanently. Every signed-in customer would then be
 * bounced back to sign-in forever, and the build output would look healthy.
 *
 * Caught by reading the route table in `npm run build`, not by a test.
 */
export const dynamic = "force-dynamic";

/**
 * A signed-in customer's saved order requests — one person's page, so nothing
 * about it is shareable or cacheable. Every other route in the app stays static.
 */
export default async function AccountPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = ACCOUNT[locale].page;
  // Redirects to /sign-in when there is no session. Authorization lives here,
  // next to the data, not in a proxy that a matcher edit could quietly stop
  // covering.
  const session = await requireSession();

  // How an approved partner finds their portal. There is no link to /partner
  // anywhere public — the route is noindex and out of the sitemap — so without
  // this a partner would be told they were approved and given nowhere to go.
  // `null` for the overwhelming majority of visitors, which is the normal case
  // rather than an error.
  let partner: Awaited<ReturnType<typeof partnerForUser>> = null;
  try {
    partner = await partnerForUser(session.uid);
  } catch {
    // The portal link is a convenience; failing to read it must not take this
    // page down with it.
  }

  let requests: SavedOrderRequest[];
  let unavailable = false;
  // Where each of these stands: with the branch, ready to pay, paid,
  // delivered or cancelled. A convenience on top of the list: if it cannot be
  // read, the cards simply show without a status or a Pay button, and the
  // checkout page still works by reference.
  const orderStates = await checkoutStatesForCustomer(session.uid).catch(
    () => new Map<string, AccountOrderStatus>(),
  );
  // The code each paid, undelivered order is confirmed with at the door. Only
  // ever this customer's own; if it cannot be read the cards show without it
  // and the code is still in their receipt email.
  const deliveryCodes = await deliveryCodesForCustomer(session.uid).catch(() => new Map<string, string>());
  try {
    requests = await listOrderRequestsForCustomer(session.uid);
  } catch {
    // Database unreachable. Say so plainly: an empty list would tell the
    // customer their requests are gone.
    requests = [];
    unavailable = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">
        {session.name ? copy.hello(session.name.split(" ")[0]) : copy.yourAccount}
      </p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        {copy.heading}
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        {copy.intro}
      </p>

      {partner && (
        <div className="glass-card mt-8 rounded-2xl px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            {copy.youManage(partner.displayName)}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {copy.partnerBody}
          </p>
          <Link
            href="/partner"
            className="btn-pill btn-ink mt-5 inline-block px-5 py-2 text-sm"
          >
            {copy.openPartner}
          </Link>
        </div>
      )}

      {unavailable ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
          <h2 className="font-display text-xl font-medium">
            {copy.unavailableHeading}
          </h2>
          <p className="mt-3 text-sm text-muted">
            {copy.unavailableBody}
          </p>
        </div>
      ) : requests.length === 0 ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-16 text-center">
          <h2 className="font-display text-xl font-medium">
            {copy.emptyHeading}
          </h2>
          <p className="mt-3 text-sm text-muted">
            {copy.emptyBody}
          </p>
          <Link
            href="/search"
            className="btn-pill btn-lime mt-8 px-6 py-2.5 text-sm"
          >
            {copy.browse}
          </Link>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {requests.map((request) => (
            <SavedRequestCard
              key={request.id}
              request={request}
              status={orderStates.get(request.reference) ?? null}
              deliveryCode={deliveryCodes.get(request.reference) ?? null}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
