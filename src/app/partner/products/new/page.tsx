import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ListProductForm from "@/components/partner/ListProductForm";
import { requirePartner } from "@/server/partners/portal";

export const metadata: Metadata = {
  title: "List a product",
  robots: { index: false, follow: false },
};

/** Same reasoning as `/partner` — see the note there. */
export const dynamic = "force-dynamic";

/**
 * Where a branch partner proposes a product.
 *
 * The page checks three things and the Server Action checks all three again:
 * signed in, a partner, a *brand* partner who is not suspended. That is not
 * belt and braces — a Server Action is a public HTTP endpoint that anyone can
 * POST to directly, so the page rendering this form is not its gate. The page
 * check exists only so nobody fills in a form that was never going to be
 * accepted.
 */
export default async function NewProductPage() {
  const { partner } = await requirePartner("/partner/products/new");

  // A courier has no products, and a suspended partner may look but not
  // submit. `notFound()` rather than a redirect, matching `requirePartner`:
  // neither should be told there is a page here they nearly qualify for.
  if (partner.kind !== "brand" || partner.status !== "active") notFound();

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <Link href="/partner" className="text-sm text-muted hover:text-foreground">
        ← Your listings
      </Link>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">
        List a product
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        This goes to MalFleks for review, not straight onto the site. Someone reads
        every listing before it appears — usually within a day. Describe the
        product the way you would to a customer standing in front of you.
      </p>

      <ListProductForm />
    </div>
  );
}
