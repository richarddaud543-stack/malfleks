import type { MetadataRoute } from "next";
import {
  getAllBranches,
  getAllBrands,
  getAllProducts,
} from "@/server/repositories";
import { LOCALES, PAGE_PATHS } from "@/lib/site-copy";
import { resolveSiteUrl } from "@/lib/site-url";

const siteUrl = resolveSiteUrl();

/**
 * The pages that exist in English and in Swahili: one entry per language,
 * each naming the other, so a search engine shows a Swahili reader the
 * Swahili page.
 */
function twoLanguagePage(page: keyof typeof PAGE_PATHS, priority: number): MetadataRoute.Sitemap {
  const address = (path: string) => `${siteUrl}${path === "/" ? "/" : path}`;
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, address(PAGE_PATHS[page][locale])]));
  return LOCALES.map((locale) => ({
    url: address(PAGE_PATHS[page][locale]),
    changeFrequency: page === "home" ? ("weekly" as const) : ("monthly" as const),
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

  const staticRoutes: MetadataRoute.Sitemap = [
    ...twoLanguagePage("home", 1),
    { url: `${siteUrl}/brands`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/search`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/locator`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/agents`, changeFrequency: "weekly", priority: 0.6 },
    // Indexable on purpose, unlike /account: a brand that cannot find this page
    // cannot apply, which is why /apply stays a static route.
    { url: `${siteUrl}/apply`, changeFrequency: "monthly", priority: 0.5 },
    // The plain-language account of what MalFleks does -- the page to land on
    // for anyone asking whether it is safe to pay here.
    ...twoLanguagePage("howItWorks", 0.8),
    // /account and /sign-in are deliberately absent: both are `noindex` --
    // one is a private page, the other a button with nothing to read. Listing
    // a noindex URL in a sitemap tells crawlers two opposite things, which is
    // what this file did with /sign-in until 4 Oct 2026.
    // Rarely changed, and the pages a visitor looks for when deciding whether
    // to trust the site with a phone number and an address.
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const brandRoutes: MetadataRoute.Sitemap = brands.map((brand) => ({
    url: `${siteUrl}/brands/${brand.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const branchRoutes: MetadataRoute.Sitemap = branches.map((branch) => {
    return {
      url: `${siteUrl}/brands/${slugByBrandId.get(branch.brandId) ?? branch.brandId}/branches/${branch.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    };
  });

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/products/${product.id}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // The order form for each product (`/delivery/[productId]`) is not listed
  // and is `noindex`: it is a form, the product page already says everything
  // on it, and a search result that lands on a form is a worse result.

  return [
    ...staticRoutes,
    ...brandRoutes,
    ...branchRoutes,
    ...productRoutes,
  ];
}
