import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ReportListingForm from "@/components/report/ReportListingForm";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { REPORT } from "@/i18n/copy/report";
import { pageLocale } from "@/i18n/server";
import { getAllProducts, getBrandById, getProductById } from "@/server/repositories";

type Props = { params: Promise<{ lang: string; productId: string }> };

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((p) => ({ productId: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const copy = REPORT[locale];
  const { productId } = await params;
  const product = await getProductById(productId);
  // A form, not a page to find in a search -- the same rule as /delivery.
  const robots = { index: false, follow: true };
  return { title: product ? copy.titleFor(product.name) : copy.title, robots };
}

/**
 * Report a listing: a copied photo, a brand used without permission, a fake,
 * something unsafe, a wrong price. See `reportListing` for what happens to it
 * and the Terms ("Reporting a listing") for what MalFleks promises.
 */
export default async function ReportPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = REPORT[locale];
  const { productId } = await params;
  const product = await getProductById(productId);
  if (!product) notFound();
  const brand = await getBrandById(product.brandId);
  const productPath = `/products/${product.id}`;

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <ScrollReveal>
        <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">{copy.heading}</h1>
        <p className="mt-4 max-w-prose text-muted">{copy.intro(product.name, brand?.name ?? "MalFleks")}</p>
      </ScrollReveal>

      <ReportListingForm productId={product.id} productPath={productPath} />

      <p className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
        <Link href={productPath} className="text-accent underline decoration-border underline-offset-4">
          {copy.back}
        </Link>
        <Link href="/terms#report" className="text-accent underline decoration-border underline-offset-4">
          {copy.terms}
        </Link>
      </p>
    </div>
  );
}
