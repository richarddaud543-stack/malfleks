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
  getAgentsForCity,
  getAllProducts,
  getProductById,
  getBrandById,
  getBranchById,
} from "@/server/repositories";
import ProductGallery from "@/components/product/ProductGallery";
import ProductShowcase from "@/components/product/ProductShowcase";
import DeliveryRouteLine from "@/components/delivery/DeliveryRouteLine";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { describeBranchLocation, formatTZS } from "@/lib/format";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-json-ld";
import { productPhotoList } from "@/lib/product-photo";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  orderBlockReason,
  previewDelivery,
  resolveDeliveryRoute,
} from "@/lib/order";

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  const brand = product ? await getBrandById(product.brandId) : undefined;

  if (!product || !brand) {
    return { title: "Product not found" };
  }

  const description = `${product.name} from ${brand.name} — ${formatTZS(product.priceTZS)}. ${product.description}`;

  // The main photo, when there is one, is what a shared link shows in
  // WhatsApp, Facebook and X. Without it a product link shared into a group
  // chat — which is how most things are sold here — arrives as bare text.
  // Listings with only an icon get no image rather than a picture of an icon.
  const [mainPhoto] = productPhotoList(product);
  const title = `${product.name} — ${brand.name}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(mainPhoto ? { images: [{ url: mainPhoto, alt: product.name }] } : {}),
    },
    twitter: mainPhoto
      ? { card: "summary_large_image", title, description, images: [mainPhoto] }
      : { card: "summary", title, description },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  const brand = await getBrandById(product.brandId);
  const branch = await getBranchById(product.branchId);

  if (!brand || !branch) {
    notFound();
  }

  // Same rule, same answer as /delivery/[productId] — just reached before the
  // customer commits rather than after. `blockReason` is the long-form version
  // of `outlook.unavailable`; both come from the one rule in lib/order.
  // The couriers come from the database, not `src/data`. Without this the page
  // would rank and offer the seeded fixture couriers — and ignore every real
  // one a partner had been wired up as.
  const agents = await getAgentsForCity(branch.city);
  const outlook = previewDelivery({ product, brand, branch, agents });
  const blockReason = orderBlockReason(
    product,
    resolveDeliveryRoute(branch, agents)
  );

  const photos = productPhotoList(product);

  // What search engines read to show price and availability under the link.
  const structuredData = buildProductJsonLd({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    priceTZS: product.priceTZS,
    inStock: product.inStock,
    photos,
    brandName: brand.name,
    sellerName: branch.name,
    url: `${resolveSiteUrl().replace(/\/+$/, "")}/products/${product.id}`,
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <script
        type="application/ld+json"
        // Partner-written text goes in here, so it is serialised with `<`
        // escaped — see `serializeJsonLd`.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Breadcrumbs
        siteUrl={resolveSiteUrl().replace(/\/+$/, "")}
        trail={[
          { label: "Brands", href: "/brands" },
          { label: brand.name, href: `/brands/${brand.slug}` },
          { label: branch.name, href: `/brands/${brand.slug}/branches/${branch.id}` },
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* Sticky on desktop so the product panel holds while the specs
            scroll past it, rather than scrolling away the moment the
            customer starts reading — the same pattern the order summary
            already uses. Grid children stretch by default, so `self-start`
            is what gives sticky room to move in. */}
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
            {/* Real photos get the gallery; a listing without any keeps the
                icon panel it always had. One wrapping element either way, so
                the shared-element transition above has a single stable node
                to morph into. */}
            {photos.length > 0 ? (
              <div className="w-full">
                <ProductGallery photos={photos} name={product.name} />
              </div>
            ) : (
              <div className="h-[360px] w-full sm:h-[440px]">
                <ProductShowcase
                  accentColor={brand.accentColor}
                  icon={product.image}
                />
              </div>
            )}
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-2xl font-semibold">
              {formatTZS(product.priceTZS)}
            </p>
            {/* Said in words, next to the price, in both states. Until now
                the page only spoke up when something was *out* of stock, and
                only further down in the delivery line — so "in stock" was
                something a customer had to infer from silence. */}
            <span
              data-testid="stock-label"
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                product.inStock
                  ? "bg-accent/15 text-accent"
                  : "bg-foreground/10 text-foreground"
              }`}
            >
              {product.inStock ? "In stock" : "Out of stock"}
            </span>
          </div>
          {/* `whitespace-pre-line`: a partner who wrote the description as a
              few short lines — what it is, what's in the box, the warranty —
              gets those lines back, instead of one run-on paragraph. */}
          <p className="mt-4 whitespace-pre-line text-muted">
            {product.description}
          </p>

          <div className="mt-6">
            <DeliveryRouteLine outlook={outlook} size="prominent" />
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

          {/* An order that cannot be routed used to be discovered on the next
              page, after the customer had already committed to it. The rule
              runs here now, so the CTA is only offered when pressing it can
              actually lead somewhere. */}
          {blockReason ? (
            <div
              data-testid="product-unavailable"
              className="glass-card mt-10 rounded-2xl p-6"
            >
              <h2 className="font-display text-base font-medium">
                This can&apos;t be ordered right now
              </h2>
              <p className="mt-2 text-sm text-muted">{blockReason}</p>
              <p className="mt-2 text-sm text-muted">
                {describeBranchLocation(branch)}
                {branch.phone ? ` · ${branch.phone}` : ""}.
              </p>
              <Link
                href="/search"
                className="mt-5 inline-block rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                Find something similar
              </Link>
            </div>
          ) : (
            <div className="mt-10">
              <Link
                href={`/delivery/${product.id}`}
                className="btn-pill btn-lime px-7 py-3.5 text-base"
              >
                Order & choose delivery
              </Link>
              {/* Only on the orderable path: the blocked panel above already
                  names the branch, and "Available at…" under "this can't be
                  ordered" contradicts itself. */}
              <p className="mt-3 text-xs text-muted">
                Available at {branch.name}
                {/* Most branch names already end in their city. */}
                {branch.name.includes(branch.city) ? "" : `, ${branch.city}`}
              </p>
            </div>
          )}
        </ScrollReveal>
      </div>
    </div>
  );
}
