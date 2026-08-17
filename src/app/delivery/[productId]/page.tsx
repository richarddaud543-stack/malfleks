import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllProducts,
  getProductById,
  getBrandById,
  getBranchById,
} from "@/server/repositories";
import OrderRequestForm from "@/components/order/OrderRequestForm";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { formatTZS } from "@/lib/format";
import {
  deliveryRouteLabel,
  orderBlockReason,
  resolveDeliveryRoute,
} from "@/lib/order";

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((p) => ({ productId: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const product = await getProductById(productId);

  if (!product) {
    return { title: "Delivery" };
  }

  return { title: `Delivery for ${product.name}` };
}

export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = await getProductById(productId);

  if (!product) {
    notFound();
  }

  const brand = await getBrandById(product.brandId);
  const branch = await getBranchById(product.branchId);

  if (!brand || !branch) {
    notFound();
  }

  const route = resolveDeliveryRoute(branch);
  const blockReason = orderBlockReason(product, route);

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <Link
        href={`/products/${product.id}`}
        className="text-sm text-muted hover:text-foreground"
      >
        ← {product.name}
      </Link>

      <ScrollReveal>
        <p className="mt-4 font-accent-serif italic text-accent">
          {deliveryRouteLabel(route.kind)}
        </p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
          Delivery for your order
        </h1>
        <p className="mt-2 text-muted">
          {product.name} · {formatTZS(product.priceTZS)} · from {branch.name}
        </p>
      </ScrollReveal>

      {route.kind === "brand" ? (
        // Brand-delivery routes reuse `.panel`'s pale mint fill — the same
        // "positive" green the rest of the site already spends on brand
        // delivery (BrandCard's badge, the homepage's "Brand delivery" tile)
        // — so this reads as unmistakably the good-news panel at a glance,
        // not just via the badge text.
        <ScrollReveal delay={0.1}>
          <div data-testid="brand-delivery-panel" className="panel mt-10 p-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Brand delivery
            </span>
            <h2 className="mt-4 font-display text-xl font-medium">
              {brand.name} delivers this order directly
            </h2>
            <p className="mt-3 text-sm text-muted">
              {branch.name} runs its own delivery service. Once you confirm,
              {" " + brand.name} will handle pickup and drop-off — no
              third-party courier needed.
            </p>
          </div>
        </ScrollReveal>
      ) : (
        // No shared "caution panel" utility exists, so the fill is built
        // from --accent-3 (the burnt-orange token already tuned to clear
        // 4.5:1 as text) at the same radius steps as `.panel`, keeping this
        // visually distinct from the brand-delivery mint without inventing a
        // new globals.css utility.
        <ScrollReveal delay={0.1}>
          <div
            data-testid="local-agent-panel"
            className="mt-10 rounded-[1.75rem] border border-accent-3/25 bg-accent-3/10 p-8 sm:rounded-[2rem]"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-accent-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-3" />
              Local agent delivery
            </span>
            <h2 className="mt-4 font-display text-xl font-medium">
              {branch.name} doesn&apos;t deliver directly
            </h2>
            <p className="mt-3 text-sm text-muted">
              Choose a local delivery agent serving {branch.city} to complete
              your order.
            </p>
          </div>
        </ScrollReveal>
      )}

      {/* Out of stock, or nobody serves this city: say so rather than taking a
          request the branch could not act on. */}
      {blockReason ? (
        <div
          data-testid="order-blocked"
          className="glass-card mt-8 rounded-2xl p-8"
        >
          <h2 className="font-display text-xl font-medium">
            This can&apos;t be ordered right now
          </h2>
          <p className="mt-3 text-sm text-muted">{blockReason}</p>
          <p className="mt-3 text-sm text-muted">
            {branch.name} is at {branch.addressLine}, open {branch.hours}
            {branch.phone ? ` · ${branch.phone}` : ""}.
          </p>
          <Link
            href="/search"
            className="mt-6 inline-block rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            Find something similar
          </Link>
        </div>
      ) : (
        <OrderRequestForm
          product={product}
          brand={brand}
          branch={branch}
          route={route}
        />
      )}
    </div>
  );
}
