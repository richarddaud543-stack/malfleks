import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { brands, getBrandBySlug, getBranchesByBrandId } from "@/data";
import BranchCard from "@/components/branch/BranchCard";
import ScrollReveal from "@/components/motion/ScrollReveal";

export function generateStaticParams() {
  return brands.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = getBrandBySlug(slug);

  if (!brand) {
    return { title: "Brand not found" };
  }

  return {
    title: brand.name,
    description: brand.description,
    openGraph: { title: brand.name, description: brand.description },
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = getBrandBySlug(slug);

  if (!brand) {
    notFound();
  }

  const branches = getBranchesByBrandId(brand.id);

  return (
    <div className="relative mx-auto max-w-6xl px-5 py-16">
      <div
        className="blob -z-10 h-[360px] w-[360px] -left-20 -top-20 opacity-30"
        style={{ background: brand.accentColor }}
      />
      <ScrollReveal>
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative h-20 w-20 rounded-2xl bg-white p-4 shadow-xl">
            <Image
              src={brand.logo}
              alt={brand.name}
              fill
              sizes="80px"
              priority
              className="object-contain p-4"
            />
          </div>
          <div>
            <h1 className="font-display text-4xl font-medium tracking-tight">
              {brand.name}
            </h1>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">
              {brand.category}
            </p>
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
