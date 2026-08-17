import type { Metadata } from "next";
import Link from "next/link";
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
import ProductGrid from "@/components/product/ProductGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";

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
  params: Promise<{ slug: string; branchId: string }>;
}): Promise<Metadata> {
  const { branchId } = await params;
  const branch = await getBranchById(branchId);
  const brand = branch ? await getBrandById(branch.brandId) : undefined;

  if (!branch || !brand) {
    return { title: "Branch not found" };
  }

  const description = `${brand.name} — ${branch.addressLine}. ${
    branch.deliveryOffered ? "Offers brand delivery." : "Connects to a local delivery agent."
  }`;

  return {
    title: branch.name,
    description,
    openGraph: { title: branch.name, description },
  };
}

export default async function BranchPage({
  params,
}: {
  params: Promise<{ slug: string; branchId: string }>;
}) {
  const { slug, branchId } = await params;
  const brand = await getBrandBySlug(slug);
  const branch = await getBranchById(branchId);

  if (!brand || !branch || branch.brandId !== brand.id) {
    notFound();
  }

  const branchProducts = await getProductsByBranchId(branch.id);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <ScrollReveal>
        <Link
          href={`/brands/${brand.slug}`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← {brand.name}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-accent-serif italic text-accent">
              {branch.city}
            </p>
            <h1 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
              {branch.name}
            </h1>
            <p className="mt-2 text-muted">{branch.addressLine}</p>
            <p className="mt-1 text-sm text-muted">{branch.hours}</p>
            {branch.phone && (
              <a
                href={`tel:${branch.phone}`}
                className="mt-1 block text-sm text-accent hover:underline"
              >
                {branch.phone}
              </a>
            )}
          </div>
          <DeliveryBadge deliveryOffered={branch.deliveryOffered} />
        </div>
        {!branch.verified && (
          <p className="mt-3 text-xs text-muted">
            * This branch location is illustrative for this prototype and
            has not been independently verified.
          </p>
        )}
      </ScrollReveal>

      <ScrollReveal delay={0.1}>
        <h2 className="mt-14 font-display text-xl font-medium tracking-tight">
          Products at this branch
        </h2>
      </ScrollReveal>

      <div className="mt-6">
        {branchProducts.length > 0 ? (
          <ProductGrid products={branchProducts} accentColor={brand.accentColor} />
        ) : (
          <p className="text-muted">No products listed at this branch yet.</p>
        )}
      </div>
    </div>
  );
}
