import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  products,
  getProductById,
  getBrandById,
  getBranchById,
} from "@/data";
import OrderRequestForm from "@/components/order/OrderRequestForm";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { formatTZS } from "@/lib/format";
import { orderBlockReason, resolveDeliveryRoute } from "@/lib/order";

export function generateStaticParams() {
  return products.map((p) => ({ productId: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const product = getProductById(productId);

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
  const product = getProductById(productId);

  if (!product) {
    notFound();
  }

  const brand = getBrandById(product.brandId);
  const branch = getBranchById(product.branchId);

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
        <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">
          Delivery for your order
        </h1>
        <p className="mt-2 text-muted">
          {product.name} · {formatTZS(product.priceTZS)} · from {branch.name}
        </p>
      </ScrollReveal>

      {route.kind === "brand" ? (
        <ScrollReveal delay={0.1}>
          <div
            data-testid="brand-delivery-panel"
            className="mt-10 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 backdrop-blur-xl"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
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
        <ScrollReveal delay={0.1}>
          <div
            data-testid="local-agent-panel"
            className="mt-10 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 backdrop-blur-xl"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
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
            className="mt-6 inline-block rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-white/30 hover:text-foreground"
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
