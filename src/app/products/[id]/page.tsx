/// <reference types="react/canary" />
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
// See src/components/search/ListingCard.tsx for why this is a triple-slash
// reference rather than `import {} from "react/canary"` — that form 500s
// under `next dev`/Turbopack (it tries to resolve a module that only exists
// under the "types" export condition).
import {
  products,
  getProductById,
  getBrandById,
  getBranchById,
} from "@/data";
import ProductShowcaseLoader from "@/components/three/ProductShowcaseLoader";
import DeliveryBadge from "@/components/delivery/DeliveryBadge";
import ScrollReveal from "@/components/motion/ScrollReveal";
import MagneticButton from "@/components/motion/MagneticButton";
import { formatTZS } from "@/lib/format";

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);
  const brand = product ? getBrandById(product.brandId) : undefined;

  if (!product || !brand) {
    return { title: "Product not found" };
  }

  const description = `${product.name} from ${brand.name} — ${formatTZS(product.priceTZS)}. ${product.description}`;

  return {
    title: `${product.name} — ${brand.name}`,
    description,
    openGraph: { title: `${product.name} — ${brand.name}`, description },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    notFound();
  }

  const brand = getBrandById(product.brandId);
  const branch = getBranchById(product.branchId);

  if (!brand || !branch) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <Link
        href={`/brands/${brand.slug}/branches/${branch.id}`}
        className="text-sm text-muted hover:text-foreground"
      >
        ← {branch.name}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* Sticky on desktop so the 3D scene holds while the specs scroll past
            it, rather than scrolling away the moment the customer starts
            reading — the same pattern the order summary already uses. Grid
            children stretch by default, so `self-start` is what gives sticky
            room to move in. */}
        <ScrollReveal className="lg:sticky lg:top-24 lg:self-start">
          {/* Same name as the icon tile on ListingCard/ProductCard, scoped to
              the same "product-view" transition type those Links tag — see
              ListingCard.tsx for why this isn't the plain zero-config morph.
              `update="none"` matters here too: without it, an in-place update
              to this same node (e.g. a future edit that re-renders this page
              without a full navigation) would pick up the browser's default
              move/resize animation instead of skipping it. */}
          <ViewTransition
            name={`product-${product.id}`}
            enter={{ "product-view": "auto", default: "none" }}
            exit={{ "product-view": "auto", default: "none" }}
            update="none"
          >
            <div className="h-[360px] w-full sm:h-[440px]">
              <ProductShowcaseLoader
                accentColor={brand.accentColor}
                icon={product.image}
              />
            </div>
          </ViewTransition>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p className="font-accent-serif italic text-accent">
            {brand.name}
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
            {product.name}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">
            {product.category}
          </p>
          <p className="mt-4 text-2xl font-semibold">
            {formatTZS(product.priceTZS)}
          </p>
          <p className="mt-4 text-muted">{product.description}</p>

          <div className="mt-6 flex items-center gap-3">
            <DeliveryBadge deliveryOffered={branch.deliveryOffered} />
            {!product.inStock && (
              <span className="text-sm text-muted">Currently out of stock</span>
            )}
          </div>

          {product.specs && (
            <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6">
              {Object.entries(product.specs).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {key}
                  </dt>
                  <dd className="mt-1 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-10">
            <MagneticButton href={`/delivery/${product.id}`} variant="primary">
              Order & choose delivery
            </MagneticButton>
          </div>

          <p className="mt-3 text-xs text-muted">
            Available at {branch.name}, {branch.city}
          </p>
        </ScrollReveal>
      </div>
    </div>
  );
}
