import { CHROME } from "@/i18n/copy/chrome";
import { PLACES } from "@/i18n/copy/places";
import { localeAlternates, localePath, OG_LOCALE } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-metadata";
import { notFound } from "next/navigation";
import {
  getAllBranches,
  getAllBrands,
  getBrandBySlug,
  getBrandById,
  getBranchById,
  getProductsByBranchId,
} from "@/server/repositories";
import DeliveryBadge from "@/components/delivery/DeliveryBadge";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { displayPhone } from "@/lib/order";
import { resolveSiteUrl } from "@/lib/site-url";
import ProductGrid from "@/components/product/ProductGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";
import VerifiedShop from "@/components/trust/VerifiedShop";
import { isVerifiedShop } from "@/server/partners/verification";

export async function generateStaticParams() {
  // Brands are fetched once and indexed rather than queried per branch, which
  // would be one round trip per prerendered page.
  const [branches, brands] = await Promise.all([
    getAllBranches(),
    getAllBrands(),
  ]);
  const slugByBrandId = new Map(brands.map((b) => [b.id, b.slug]));

  return branches.map((b) => ({
    slug: slugByBrandId.get(b.brandId) ?? b.brandId,
    branchId: b.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string; branchId: string }>;
}): Promise<Metadata> {
  const locale = await pageLocale(params);
  const copy = PLACES[locale].branch;
  const { branchId } = await params;
  const branch = await getBranchById(branchId);
  const brand = branch ? await getBrandById(branch.brandId) : undefined;

  if (!branch || !brand) {
    return { title: copy.notFound };
  }

  const description = `${brand.name} — ${branch.addressLine ?? branch.city}. ${
    branch.deliveryOffered ? copy.offersDelivery : copy.usesCourier
  }`;

  return {
    title: branch.name,
    description,
    alternates: localeAlternates(locale, `/brands/${brand.slug}/branches/${branch.id}`),
    ...sharePreview({
      title: branch.name,
      description,
      path: localePath(locale, `/brands/${brand.slug}/branches/${branch.id}`),
      locale: OG_LOCALE[locale],
    }),
  };
}

export default async function BranchPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string; branchId: string }>;
}) {
  const locale = await pageLocale(params);
  const copy = PLACES[locale].branch;
  const { slug, branchId } = await params;
  const brand = await getBrandBySlug(slug);
  const branch = await getBranchById(branchId);

  if (!brand || !branch || branch.brandId !== brand.id) {
    notFound();
  }

  const [branchProducts, verifiedShop] = await Promise.all([getProductsByBranchId(branch.id), isVerifiedShop(branch.id)]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <ScrollReveal>
        <Breadcrumbs
          siteUrl={resolveSiteUrl().replace(/\/+$/, "")}
          label={CHROME[locale].breadcrumb}
          trail={[
            { label: PLACES[locale].brand.crumb, href: "/brands" },
            { label: brand.name, href: `/brands/${brand.slug}` },
            { label: branch.name },
          ]}
        />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-accent-serif italic text-accent">
              {branch.city}
            </p>
            <h1 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
              {branch.name}
            </h1>
            <p className="mt-2 text-muted">{branch.addressLine ?? branch.city}</p>
            {branch.hours && (
              <p className="mt-1 text-sm text-muted">{branch.hours}</p>
            )}
            {!branch.addressLine && (
              <p className="mt-2 max-w-prose text-sm text-muted">
                {copy.noAddress(brand.name)}
              </p>
            )}
            {branch.phone && (
              <a
                href={`tel:${branch.phone}`}
                className="mt-1 block text-sm text-accent hover:underline"
              >
                {displayPhone(branch.phone)}
              </a>
            )}
          </div>
          <DeliveryBadge deliveryOffered={branch.deliveryOffered} locale={locale} />
        </div>
        {/*
          This read "illustrative for this prototype" until 2026-08-31. The
          site is live and a visitor deciding whether to travel is not helped
          by knowing a developer called it a prototype — they need to know the
          location has not been confirmed, and what to do instead.
        */}
        {verifiedShop && <VerifiedShop locale={locale} className="mt-4" />}
        {!branch.verified && (
          <p className="mt-3 max-w-prose text-xs text-muted">
            {copy.unverified(brand.name)}
          </p>
        )}
      </ScrollReveal>

      <ScrollReveal delay={0.1}>
        <h2 className="mt-14 font-display text-xl font-medium tracking-tight">
          {copy.products}
        </h2>
      </ScrollReveal>

      <div className="mt-6">
        {branchProducts.length > 0 ? (
          <ProductGrid products={branchProducts} accentColor={brand.accentColor} />
        ) : (
          <p className="text-muted">{copy.noProducts}</p>
        )}
      </div>
    </div>
  );
}
