import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  products,
  getProductById,
  getBrandById,
  getBranchById,
  getAgentsForCity,
} from "@/data";
import AgentCard from "@/components/delivery/AgentCard";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { formatTZS } from "@/lib/format";

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

  const agents = branch.deliveryOffered ? [] : getAgentsForCity(branch.city);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
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

      {branch.deliveryOffered ? (
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
            <button className="mt-6 rounded-full bg-accent px-8 py-3 text-sm font-medium text-background shadow-[0_0_0_0_rgba(124,158,255,0)] transition-shadow hover:shadow-[0_0_32px_4px_rgba(124,158,255,0.45)]">
              Confirm brand delivery
            </button>
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

          <div className="mt-6 space-y-4">
            {agents.length > 0 ? (
              agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
            ) : (
              <p className="text-muted">
                No delivery agents are currently listed for {branch.city}.
                Visit the branch directly to arrange collection.
              </p>
            )}
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}
