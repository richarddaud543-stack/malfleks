import type { Metadata } from "next";
import { PLACES } from "@/i18n/copy/places";
import { localeAlternates } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import BrandCatalog from "@/components/brand/BrandCatalog";
import EmptyCatalogue from "@/components/marketplace/EmptyCatalogue";
import { groupBranchesByBrand } from "@/components/brand/BrandGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { getAllBranches, getAllBrands } from "@/server/repositories";

type Props = { params: Promise<{ lang: string }> };

// The root layout's `%s — MalFleks` template appends the name; spelling it out
// here too rendered "All brands — MalFleks — MalFleks".
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  return { title: PLACES[locale].brands.title, alternates: localeAlternates(locale, "/brands") };
}

export default async function BrandsPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = PLACES[locale].brands;
  const [brands, branches] = await Promise.all([
    getAllBrands(),
    getAllBranches(),
  ]);
  const branchesByBrandId = groupBranchesByBrand(branches);

  return (
    <div className="mx-auto max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
      <ScrollReveal>
        <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          {copy.heading}
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          {brands.length === 0
            ? copy.introEmpty
            : copy.intro}
        </p>
      </ScrollReveal>
      {brands.length === 0 ? (
        <div className="mt-10">
          <EmptyCatalogue looking="brands" locale={locale} />
        </div>
      ) : (
        <div className="panel mt-10 p-4 sm:p-8">
          <h2 className="sr-only">{copy.list}</h2>
          <BrandCatalog brands={brands} branchesByBrandId={branchesByBrandId} />
        </div>
      )}
    </div>
  );
}
