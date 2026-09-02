import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth/dal";
import {
  listOrderRequestsForCustomer,
  type SavedOrderRequest,
} from "@/server/orders/saved-requests";
import { partnerForUser } from "@/server/partners/portal";
import SavedRequestCard from "@/components/account/SavedRequestCard";

export const metadata: Metadata = {
  title: "Your order requests",
  description:
    "Order requests saved to your MalFleks account, with the reference to quote to the branch.",
  // One person's private page. It is not in the sitemap either, matching
  // /order/confirmation — a noindex URL advertised in a sitemap is a
  // contradiction, not thoroughness.
  robots: { index: false, follow: false },
};

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
export default async function AccountPage() {
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
        {session.name ? `Hello, ${session.name.split(" ")[0]}` : "Your account"}
      </p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        Your order requests
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Requests you made while signed in. MalFleks still takes no payment and holds
        no stock — a reference is what you quote to the branch to talk about the
        same request.
      </p>

      {partner && (
        <div className="glass-card mt-8 rounded-2xl px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            You manage {partner.displayName}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Your listings and everything waiting on MalFleks live on your partner
            page.
          </p>
          <Link
            href="/partner"
            className="btn-pill btn-ink mt-5 inline-block px-5 py-2 text-sm"
          >
            Open your partner page
          </Link>
        </div>
      )}

      {unavailable ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
          <h2 className="font-display text-xl font-medium">
            We can&apos;t load your requests right now
          </h2>
          <p className="mt-3 text-sm text-muted">
            This is a problem at our end, not a sign that anything was lost. Try
            again in a moment.
          </p>
        </div>
      ) : requests.length === 0 ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-16 text-center">
          <h2 className="font-display text-xl font-medium">
            Nothing saved yet
          </h2>
          <p className="mt-3 text-sm text-muted">
            Order requests you make while signed in will be kept here, with the
            reference to quote to the branch.
          </p>
          <Link
            href="/search"
            className="btn-pill btn-lime mt-8 px-6 py-2.5 text-sm"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {requests.map((request) => (
            <SavedRequestCard key={request.id} request={request} />
          ))}
        </ul>
      )}
    </div>
  );
}
