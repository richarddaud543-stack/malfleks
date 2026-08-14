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
    <div className="mx-auto max-w-6xl px-5 py-16">
      <ScrollReveal>
        <h1 className="font-display text-4xl font-medium tracking-tight">All brands</h1>
        <p className="mt-2 max-w-xl text-muted">
          Every brand on Soko has its own branches across Tanzania, each
          with its own delivery status.
        </p>
      </ScrollReveal>
      <div className="mt-10">
        <BrandCatalog brands={brands} />
      </div>
    </div>
  );
}
