import type { Brand, Product } from "@/data";

/**
 * What the homepage showcase cycles through.
 *
 * This lives outside `ShowcaseCarousel.tsx` because that file is a client
 * component, and a `"use client"` module's exports cannot be called from the
 * server — only rendered as components or passed as props. The homepage picks
 * the items server-side so the browser receives six products rather than the
 * whole catalogue, which means the picking has to be importable from both
 * sides.
 */
export interface FeaturedItem {
  brand: Brand;
  product: Product;
}

/**
 * One representative, preferably in-stock, product per brand. Exported so the
 * carousel's own test can use it as the source of truth for "what appears at
 * slide N" instead of re-deriving the picking logic itself.
 */
export function getFeatured(
  brands: Brand[],
  products: Product[]
): FeaturedItem[] {
  return brands.flatMap((brand) => {
    const brandProducts = products.filter((p) => p.brandId === brand.id);
    const product =
      brandProducts.find((p) => p.inStock) ?? brandProducts[0] ?? null;
    return product ? [{ brand, product }] : [];
  });
}
