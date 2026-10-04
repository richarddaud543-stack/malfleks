import { ORDER } from "@/i18n/copy/order";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PayPanel from "@/components/order/PayPanel";
import { requireSession } from "@/server/auth/dal";
import { checkoutForCustomer } from "@/server/orders/checkout";

type Props = { params: Promise<{ lang: string; reference: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const copy = ORDER[await pageLocale(params)].pay;
  return { title: copy.title, robots: { index: false, follow: false } };
}

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
export default async function PayPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = ORDER[locale].pay;
  const { reference } = await params;
  const session = await requireSession(`/pay/${encodeURIComponent(reference)}`);

  const view = await checkoutForCustomer(session.uid, reference, { createIfMissing: true }).catch(() => undefined);
  if (!view) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/account" className="text-sm text-muted hover:text-foreground">
        ← {copy.back}
      </Link>
      <p className="mt-4 font-mono text-sm tracking-[0.18em] text-muted">{view.reference}</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        {view.state === "paid" ? copy.headingPaid : copy.heading}
      </h1>

      <PayPanel initial={view} />

      <p className="mt-8 max-w-prose text-xs text-muted">
        {copy.footnote.before}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          {copy.footnote.link}
        </Link>
        {copy.footnote.after}
      </p>
    </div>
  );
}
