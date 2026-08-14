import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
        <ScrollReveal>
          <div className="h-[360px] w-full sm:h-[440px]">
            <ProductShowcaseLoader
              accentColor={brand.accentColor}
              icon={product.image}
            />
          </div>
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
