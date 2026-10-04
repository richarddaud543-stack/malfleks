import type { MetadataRoute } from "next";
import {
  getAllBranches,
  getAllBrands,
  getAllProducts,
} from "@/server/repositories";
import { LOCALES, localePath } from "@/i18n/locale";
import { resolveSiteUrl } from "@/lib/site-url";

const siteUrl = resolveSiteUrl();

type Frequency = "weekly" | "monthly" | "yearly";

/**
 * One page, listed once per language, each entry naming the other -- so a
 * search engine shows a Swahili reader the Swahili page and an English reader
 * the English one. `path` is the plain address (`/search`).
 */
function inEachLanguage(path: string, changeFrequency: Frequency, priority: number): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, `${siteUrl}${localePath(locale, path)}`]));
  return LOCALES.map((locale) => ({
    url: `${siteUrl}${localePath(locale, path)}`,
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [brands, branches, products] = await Promise.all([
    getAllBrands(),
    getAllBranches(),
    getAllProducts(),
  ]);
  // Indexed once instead of a lookup per branch, as in generateStaticParams.
  const slugByBrandId = new Map(brands.map((b) => [b.id, b.slug]));

  return [
    ...inEachLanguage("/", "weekly", 1),
    ...inEachLanguage("/brands", "weekly", 0.9),
    ...inEachLanguage("/search", "weekly", 0.8),
    ...inEachLanguage("/locator", "weekly", 0.7),
    ...inEachLanguage("/agents", "weekly", 0.6),
    // Indexable on purpose, unlike /account: a brand that cannot find this page
    // cannot apply, which is why /apply stays listed.
    ...inEachLanguage("/apply", "monthly", 0.5),
    // The plain-language account of what MalFleks does -- the page to land on
    // for anyone asking whether it is safe to pay here.
    ...inEachLanguage("/how-it-works", "monthly", 0.8),
    // /account and /sign-in are deliberately absent: both are `noindex` --
    // one is a private page, the other a button with nothing to read. Listing
    // a noindex URL in a sitemap tells crawlers two opposite things, which is
    // what this file did with /sign-in until 4 Oct 2026.
    // Rarely changed, and the pages a visitor looks for when deciding whether
    // to trust the site with a phone number and an address.
    ...inEachLanguage("/contact", "yearly", 0.4),
    ...inEachLanguage("/terms", "yearly", 0.2),
    ...inEachLanguage("/privacy", "yearly", 0.2),

    ...brands.flatMap((brand) => inEachLanguage(`/brands/${brand.slug}`, "weekly", 0.8)),
    ...branches.flatMap((branch) =>
      inEachLanguage(`/brands/${slugByBrandId.get(branch.brandId) ?? branch.brandId}/branches/${branch.id}`, "weekly", 0.7),
    ),
    ...products.flatMap((product) => inEachLanguage(`/products/${product.id}`, "weekly", 0.7)),

    // The order form for each product (`/delivery/[productId]`) is not listed
    // and is `noindex`: it is a form, the product page already says everything
    // on it, and a search result that lands on a form is a worse result.
  ];
}
