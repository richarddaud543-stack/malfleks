import Link from "next/link";

import BrandGrid, { groupBranchesByBrand } from "@/components/brand/BrandGrid";
import ProductCard from "@/components/product/ProductCard";
import type { Branch, Brand, Product } from "@/data";
import { PAGE_PATHS, SITE_COPY, type Locale } from "@/lib/site-copy";

/**
 * The home page below its first screen. Four plain sections, each a
 * different shape, each drawn from the real catalogue or from words already
 * agreed elsewhere:
 *
 *   products -- what is actually for sale today
 *   steps    -- how buying works (`how-it-works.ts`)
 *   shops    -- who is selling, and where
 *   partners -- the one ask of a shop or courier reading this
 *
 * **No counters.** The page used to open with "2 brands, 2 branches, 1 city",
 * which told a first-time visitor how small the marketplace was before it
 * told them anything else. The shops and products are shown instead of
 * counted; a page with two real shops on it does not need a number.
 *
 * Each section takes the language it is to be written in. The headings and
 * sentences come from `site-copy.ts`; the product and shop cards are the
 * catalogue's own words, which are English, and are marked as such so a
 * screen reader does not read them with a Swahili voice.
 */

/** How many products the home page shows before sending people to search. */
export const HOME_PRODUCT_LIMIT = 8;

/** What is in stock now, newest catalogue order first, a few from each brand. */
export function pickHomeProducts(brands: Brand[], products: Product[], limit = HOME_PRODUCT_LIMIT) {
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  // In stock before out of stock, and nothing whose shop is not on the site.
  const listed = products.filter((product) => brandById.has(product.brandId));
  const ordered = [...listed.filter((p) => p.inStock), ...listed.filter((p) => !p.inStock)];
  return ordered.slice(0, limit).map((product) => ({ product, brand: brandById.get(product.brandId)! }));
}

export function HomeProducts({
  brands,
  products,
  locale = "en",
}: {
  brands: Brand[];
  products: Product[];
  locale?: Locale;
}) {
  const copy = SITE_COPY[locale].products;
  const picks = pickHomeProducts(brands, products);
  if (picks.length === 0) return null;

  return (
    <section aria-labelledby="home-products-heading" className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="home-products-heading" className="font-display text-3xl font-medium tracking-tight">
          {copy.heading}
        </h2>
        <Link href="/search" className="text-sm font-medium text-accent underline decoration-border underline-offset-4">
          {copy.all}
        </Link>
      </div>
      <ul lang="en" className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {picks.map(({ product, brand }) => (
          <li key={product.id}>
            <ProductCard product={product} accentColor={brand.accentColor} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeSteps({ locale = "en" }: { locale?: Locale }) {
  const copy = SITE_COPY[locale].steps;

  return (
    <section aria-labelledby="home-steps-heading" className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <h2 id="home-steps-heading" className="font-display text-3xl font-medium tracking-tight">
        {copy.heading}
      </h2>
      <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {copy.items.map((step, index) => (
          <li key={step.title} className="border-t-2 border-foreground pt-4">
            <p aria-hidden="true" className="font-display text-3xl font-medium text-accent">
              {index + 1}
            </p>
            <h3 className="mt-2 font-display text-lg font-medium leading-snug">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8">
        <Link
          href={PAGE_PATHS.howItWorks[locale]}
          className="text-sm font-medium text-accent underline decoration-border underline-offset-4"
        >
          {copy.more}
        </Link>
      </p>
    </section>
  );
}

/** "Dodoma", "Dodoma and Arusha", "Dodoma, Arusha and Mwanza" -- or with "na" in Swahili. */
export function listCities(branches: Branch[], and = "and"): string {
  const cities = [...new Set(branches.map((branch) => branch.city))].sort((a, b) => a.localeCompare(b));
  if (cities.length <= 1) return cities[0] ?? "";
  return `${cities.slice(0, -1).join(", ")} ${and} ${cities[cities.length - 1]}`;
}

export function HomeShops({
  brands,
  branches,
  locale = "en",
}: {
  brands: Brand[];
  branches: Branch[];
  locale?: Locale;
}) {
  if (brands.length === 0) return null;
  const copy = SITE_COPY[locale].shops;
  const cities = listCities(branches, copy.and);

  return (
    <section aria-labelledby="home-shops-heading" className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="home-shops-heading" className="font-display text-3xl font-medium tracking-tight">
            {copy.heading}
          </h2>
          {cities && <p className="mt-2 text-muted">{copy.delivering(cities)}</p>}
        </div>
        <Link href="/locator" className="text-sm font-medium text-accent underline decoration-border underline-offset-4">
          {copy.find}
        </Link>
      </div>
      <div lang="en" className="mt-6">
        <BrandGrid brands={brands} branchesByBrandId={groupBranchesByBrand(branches)} />
      </div>
    </section>
  );
}

/** Shown in place of the catalogue sections while there is no shop on the site yet. */
export function HomeOpeningSoon({ locale = "en" }: { locale?: Locale }) {
  const copy = SITE_COPY[locale].openingSoon;

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <h2 className="font-display text-3xl font-medium tracking-tight">{copy.heading}</h2>
      <p className="mt-3 max-w-prose text-muted">{copy.body}</p>
    </section>
  );
}

export function HomePartners({ locale = "en" }: { locale?: Locale }) {
  const copy = SITE_COPY[locale].partners;

  return (
    <section aria-labelledby="home-partners-heading" className="mx-auto max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
      <div className="panel flex flex-wrap items-center justify-between gap-6 px-6 py-10 sm:px-10">
        <div className="max-w-xl">
          <h2 id="home-partners-heading" className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
            {copy.heading}
          </h2>
          <p className="mt-2 text-muted">{copy.body}</p>
        </div>
        <Link href="/apply" className="btn-pill btn-ink px-7 py-3 text-base">
          {copy.action}
        </Link>
      </div>
    </section>
  );
}
