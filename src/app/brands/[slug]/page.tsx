import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { resolveSiteUrl } from "@/lib/site-url";
import BrandLogo from "@/components/brand/BrandLogo";
import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-metadata";
import { notFound } from "next/navigation";
import type { BrandCategory } from "@/data";
import {
  getAllBrands,
  getBrandBySlug,
  getBranchesByBrandId,
} from "@/server/repositories";
import BranchCard from "@/components/branch/BranchCard";
import ScrollReveal from "@/components/motion/ScrollReveal";

/**
 * `brand.category` is stored lowercase for matching/filtering (see
 * `src/lib/search.ts`) — this is presentation-only casing for the eyebrow,
 * not a second source of truth.
 */
const CATEGORY_LABELS: Record<BrandCategory, string> = {
  automotive: "Automotive",
  electronics: "Electronics",
  telecom: "Telecom",
};

export async function generateStaticParams() {
  const brands = await getAllBrands();
  return brands.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);

  if (!brand) {
    return { title: "Brand not found" };
  }

  return {
    title: brand.name,
    description: brand.description,
    ...sharePreview({ title: `${brand.name} on MalFleks`, description: brand.description, path: `/brands/${brand.slug}` }),
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);

  if (!brand) {
    notFound();
  }

  const branches = await getBranchesByBrandId(brand.id);

  return (
    <div className="relative mx-auto max-w-6xl px-5 py-16">
      <div
        className="blob -z-10 h-[360px] w-[360px] -left-20 -top-20 opacity-30"
        style={{ background: brand.accentColor }}
      />
      {/* This page had no way back to the brand list at all. */}
      <Breadcrumbs
        siteUrl={resolveSiteUrl().replace(/\/+$/, "")}
        trail={[{ label: "Brands", href: "/brands" }, { label: brand.name }]}
      />
      <ScrollReveal>
        <div className="mt-2 flex flex-wrap items-center gap-5">
          <div className="relative h-20 w-20 rounded-2xl bg-white p-4 shadow-xl">
            <BrandLogo brand={brand} sizes="80px" className="object-contain p-4" />
          </div>
          <div>
            <p className="font-accent-serif italic text-accent">
              {CATEGORY_LABELS[brand.category]}
            </p>
            <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
              {brand.name}
            </h1>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-muted">{brand.description}</p>
      </ScrollReveal>

      <ScrollReveal delay={0.1}>
        <h2 className="mt-14 font-display text-xl font-medium tracking-tight">
          Branches ({branches.length})
        </h2>
      </ScrollReveal>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch, i) => (
          <ScrollReveal key={branch.id} delay={0.05 * i}>
            <BranchCard branch={branch} brandSlug={brand.slug} />
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
