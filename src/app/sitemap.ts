import type { MetadataRoute } from "next";
import {
  getAllBranches,
  getAllBrands,
  getAllProducts,
} from "@/server/repositories";
import { resolveSiteUrl } from "@/lib/site-url";
import { prerenderParams } from "@/server/prerender";

const siteUrl = resolveSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Prerendered at build like the four `generateStaticParams` routes, and
  // guarded the same way: a deployment with no `DATABASE_URL` gets a sitemap
  // of the static routes rather than a failed build. Those are the only URLs
  // such a deployment could honestly claim to have anyway.
  const [brands, branches, products] = await Promise.all([
    prerenderParams(getAllBrands),
    prerenderParams(getAllBranches),
    prerenderParams(getAllProducts),
  ]);
  // Indexed once instead of a lookup per branch, as in generateStaticParams.
  const slugByBrandId = new Map(brands.map((b) => [b.id, b.slug]));

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/brands`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/search`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/locator`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/agents`, changeFrequency: "weekly", priority: 0.6 },
    // Indexable on purpose, unlike /account: a brand that cannot find this page
    // cannot apply, which is why /apply stays a static route.
    { url: `${siteUrl}/apply`, changeFrequency: "monthly", priority: 0.5 },
    // /account is deliberately absent: it is `noindex` and one person's
    // private page, same as /order/confirmation. Listing a noindex URL in a
    // sitemap tells crawlers two opposite things.
    { url: `${siteUrl}/sign-in`, changeFrequency: "yearly", priority: 0.3 },
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

  const deliveryRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/delivery/${product.id}`,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [
    ...staticRoutes,
    ...brandRoutes,
    ...branchRoutes,
    ...productRoutes,
    ...deliveryRoutes,
  ];
}
