import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PayPanel from "@/components/order/PayPanel";
import { requireSession } from "@/server/auth/dal";
import { checkoutForCustomer } from "@/server/orders/checkout";

export const metadata: Metadata = {
  title: "Pay for your order",
  // One person's own order, like /track and /account: never indexed, not in the sitemap.
  robots: { index: false, follow: false },
};

/** Signed-in only and reads cookies, so it can never be prerendered. See `AccountPage` for the build failure that taught this. */
export const dynamic = "force-dynamic";

/**
 * The checkout page for one order, reached from the "your order is confirmed"
 * email, the account page, or the tracking page.
 *
 * Gated the same way `/track` is: `checkoutForCustomer` matches on reference
 * *and* the signed-in customer, so someone else's reference is a plain 404.
 * A signed-out visitor is sent to sign in and comes straight back here.
 *
 * Opening the page on a confirmed order that has no payment link yet creates
 * one — that is what `createIfMissing` does — so a customer is never stuck
 * waiting for someone at MalFleks to press a button.
 */
export default async function PayPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const session = await requireSession(`/pay/${encodeURIComponent(reference)}`);

  const view = await checkoutForCustomer(session.uid, reference, { createIfMissing: true }).catch(() => undefined);
  if (!view) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/account" className="text-sm text-muted hover:text-foreground">
        ← Your orders
      </Link>
      <p className="mt-4 font-mono text-sm tracking-[0.18em] text-muted">{view.reference}</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        {view.state === "paid" ? "Payment received" : "Pay for your order"}
      </h1>

      <PayPanel initial={view} />

      <p className="mt-8 max-w-prose text-xs text-muted">
        You pay MalFleks, not the branch. We hold your payment until the order is delivered, then pay the branch and the courier. If the
        branch can&apos;t supply the order or it can&apos;t be delivered, you are refunded in full. See the{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          terms
        </Link>
        .
      </p>
    </div>
  );
}
