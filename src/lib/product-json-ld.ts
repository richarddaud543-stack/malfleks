/**
 * The structured data a product page publishes for search engines.
 *
 * Pure and outside the page file so it can be tested: a Next.js `page.tsx`
 * may only export the page and its route config, and the two things here
 * that matter — what is claimed, and that the output cannot break out of its
 * `<script>` tag — are both worth a test.
 *
 * Only what the page itself says. No rating, no review count, nothing we do
 * not have: structured data that claims more than the visible page is how a
 * site gets its rich results taken away.
 */

export interface ProductJsonLdInput {
  id: string;
  name: string;
  description: string;
  category: string;
  priceTZS: number;
  inStock: boolean;
  /** Every photo, main one first. Empty for an icon-only listing. */
  photos: readonly string[];
  brandName: string;
  /** The branch that sells it — who the customer is actually buying from. */
  sellerName: string;
  /** Absolute URL of the product page. */
  url: string;
}

export function buildProductJsonLd(input: ProductJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.id,
    category: input.category,
    brand: { "@type": "Brand", name: input.brandName },
    // Left out entirely for an icon-only listing: an empty `image` array is
    // reported as an error by the validators, and the icon is not a photo of
    // the item.
    ...(input.photos.length > 0 ? { image: [...input.photos] } : {}),
    offers: {
      "@type": "Offer",
      url: input.url,
      priceCurrency: "TZS",
      price: input.priceTZS,
      availability: input.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: input.sellerName },
    },
  };
}

/**
 * Serialises JSON-LD for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone is not safe there: a description containing
 * `</script>` would end the tag, and whatever followed would be parsed as
 * HTML. Partners write these descriptions. Escaping `<` as `<` keeps
 * the JSON identical to a parser and inert to the HTML tokenizer — the same
 * thing Next's own JSON-LD guide says to do.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
