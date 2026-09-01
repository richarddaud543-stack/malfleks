import BrandCatalog from "@/components/brand/BrandCatalog";
import EmptyCatalogue from "@/components/marketplace/EmptyCatalogue";
import { groupBranchesByBrand } from "@/components/brand/BrandGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { getAllBranches, getAllBrands } from "@/server/repositories";

export const metadata = {
  // The root layout's `%s — Soko` template appends the brand name; spelling it
  // out here too rendered "All brands — Soko — Soko".
  title: "All brands",
};

export default async function BrandsPage() {
  const [brands, branches] = await Promise.all([
    getAllBrands(),
    getAllBranches(),
  ]);
  const branchesByBrandId = groupBranchesByBrand(branches);

  return (
    <div className="mx-auto max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
      <ScrollReveal>
        <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          All brands
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          {brands.length === 0
            ? "Brands list their own branches here, each with its own delivery status."
            : "Every brand on Soko has its own branches across Tanzania, each with its own delivery status."}
        </p>
      </ScrollReveal>
      {brands.length === 0 ? (
        <div className="mt-10">
          <EmptyCatalogue looking="brands" />
        </div>
      ) : (
        <div className="panel mt-10 p-4 sm:p-8">
          <BrandCatalog brands={brands} branchesByBrandId={branchesByBrandId} />
        </div>
      )}
    </div>
  );
}
