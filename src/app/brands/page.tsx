import BrandCatalog from "@/components/brand/BrandCatalog";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { getAllBrands } from "@/data";

export const metadata = {
  // The root layout's `%s — Soko` template appends the brand name; spelling it
  // out here too rendered "All brands — Soko — Soko".
  title: "All brands",
};

export default function BrandsPage() {
  const brands = getAllBrands();

  return (
    <div className="mx-auto max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
      <ScrollReveal>
        <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          All brands
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          Every brand on Soko has its own branches across Tanzania, each
          with its own delivery status.
        </p>
      </ScrollReveal>
      <div className="panel mt-10 p-4 sm:p-8">
        <BrandCatalog brands={brands} />
      </div>
    </div>
  );
}
