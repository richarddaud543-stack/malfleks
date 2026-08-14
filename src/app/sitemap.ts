import type { MetadataRoute } from "next";
import { brands, branches, products, getBrandById } from "@/data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/brands`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/agents`, changeFrequency: "weekly", priority: 0.6 },
  ];

  const brandRoutes: MetadataRoute.Sitemap = brands.map((brand) => ({
    url: `${siteUrl}/brands/${brand.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const branchRoutes: MetadataRoute.Sitemap = branches.map((branch) => {
    const brand = getBrandById(branch.brandId);
    return {
      url: `${siteUrl}/brands/${brand?.slug ?? branch.brandId}/branches/${branch.id}`,
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
