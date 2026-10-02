import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import LiveTrackingPanel from "@/components/track/LiveTrackingPanel";
import { requireSession } from "@/server/auth/dal";
import { checkoutStatesForCustomer } from "@/server/orders/checkout";
import { trackedOrderForCustomer } from "@/server/orders/tracking";

export const metadata: Metadata = {
  title: "Track your order",
  // One person's own order. Same reasoning as /account and /order/confirmation:
  // a noindex URL in the sitemap would be a contradiction, not thoroughness.
  robots: { index: false, follow: false },
};

/**
 * Signed-in only, same as `/account`: `verifySession()` is the DAL's
 * authoritative check and it reads cookies, so this route cannot be
 * prerendered without baking in a stale answer. See the doc comment on
 * `AccountPage` for the CI failure that taught this codebase to say so
 * explicitly rather than let the build infer it.
 */
export const dynamic = "force-dynamic";

/**
 * A signed-in customer's live tracking view for one order, reached by the
 * reference they already have — from `/order/confirmation` or a saved
 * request card.
 *
 * **Why a reference in the URL is safe here.** `Order.reference` is a short,
 * spoken-aloud code (see the schema comment: 614,656 possibilities per
 * brand+city pair), not a secret — the whole design assumes a customer reads
 * it down the phone to a branch. What actually gates this page is
 * `trackedOrderForCustomer`'s `WHERE reference, customerId` — a reference
 * that is real but belongs to someone else's order matches zero rows and
 * reaches `notFound()` below, exactly like a made-up one. Nothing here
 * depends on the reference being hard to guess.
 */
export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const session = await requireSession(`/track/${encodeURIComponent(reference)}`);

  const order = await trackedOrderForCustomer(session.uid, reference).catch(
    () => undefined,
  );

  // `undefined` (query failed) and `null` (no such order for this customer)
  // both land on the same `notFound()` — the difference is not this
  // customer's to act on, and confirming which one occurred would tell an
  // attacker something a wrong reference should not.
  if (!order) notFound();

  const payState = (await checkoutStatesForCustomer(session.uid).catch(() => null))?.get(order.reference) ?? null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <Link href="/account" className="text-sm text-muted hover:text-foreground">
        ← Your orders
      </Link>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">
        Tracking {order.reference}
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        {order.quantity > 1 && `${order.quantity} × `}
        {order.productName} · {order.branchName}, {order.branchCity}
      </p>

      {payState === "ready" && (
        <div className="glass-card mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-5">
          <p className="text-sm">
            <span className="font-medium">Confirmed by the branch.</span> Pay to complete your order.
          </p>
          <Link href={`/pay/${encodeURIComponent(order.reference)}`} className="btn-pill btn-lime px-5 py-2 text-sm font-medium">
            Pay now
          </Link>
        </div>
      )}

      <LiveTrackingPanel reference={order.reference} initialOrder={order} />
    </div>
  );
}
