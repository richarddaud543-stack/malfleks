import type { Locale } from "@/i18n/locale";
import type { Brand, Branch } from "@/data";
import BrandCard from "./BrandCard";
import ScrollReveal from "../motion/ScrollReveal";

/**
 * Indexes branches by brand id, the shape `BrandGrid` wants. Lives here beside
 * the prop it feeds so the two cannot drift; both pages that render a grid
 * fetch branches once and call this.
 */
export function groupBranchesByBrand(
  branches: Branch[]
): Record<string, Branch[]> {
  const byBrand: Record<string, Branch[]> = {};
  for (const branch of branches) {
    (byBrand[branch.brandId] ??= []).push(branch);
  }
  return byBrand;
}

export default function BrandGrid({
  brands,
  branchesByBrandId,
  locale = "en",
}: {
  brands: Brand[];
  /** Every brand's branches, indexed by brand id — see BrandCard for why. */
  branchesByBrandId: Record<string, Branch[]>;
  locale?: Locale;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {brands.map((brand, i) => (
        <ScrollReveal key={brand.id} delay={i * 0.05}>
          <BrandCard
            brand={brand}
            branches={branchesByBrandId[brand.id] ?? []}
            locale={locale}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}
