import { describe, expect, it } from "vitest";

import { buildProductJsonLd, serializeJsonLd } from "./product-json-ld";

const input = {
  id: "sub-abc",
  name: "Tecno Spark 20",
  description: "A dual-SIM phone with a big battery.",
  category: "Phones",
  priceTZS: 320_000,
  inStock: true,
  photos: ["https://p.supabase.co/storage/v1/object/public/product-photos/u/a.webp"],
  brandName: "Tecno",
  sellerName: "Tecno Kariakoo",
  url: "https://malfleks.example/products/sub-abc",
};

describe("buildProductJsonLd", () => {
  it("describes the product, its price in shillings and who sells it", () => {
    const data = buildProductJsonLd(input);

    expect(data["@type"]).toBe("Product");
    expect(data.name).toBe("Tecno Spark 20");
    expect(data.sku).toBe("sub-abc");
    expect(data.brand).toEqual({ "@type": "Brand", name: "Tecno" });
    expect(data.image).toEqual(input.photos);
    expect(data.offers.priceCurrency).toBe("TZS");
    expect(data.offers.price).toBe(320_000);
    expect(data.offers.availability).toBe("https://schema.org/InStock");
    expect(data.offers.seller).toEqual({ "@type": "Organization", name: "Tecno Kariakoo" });
  });

  it("says out of stock when it is", () => {
    expect(buildProductJsonLd({ ...input, inStock: false }).offers.availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("leaves `image` out for an icon-only listing instead of publishing an empty list", () => {
    expect("image" in buildProductJsonLd({ ...input, photos: [] })).toBe(false);
  });
});

describe("serializeJsonLd", () => {
  it("cannot be broken out of by a description containing a closing script tag", () => {
    const hostile = buildProductJsonLd({
      ...input,
      description: 'Nice phone</script><script>alert("x")</script>',
    });
    const out = serializeJsonLd(hostile);

    expect(out).not.toContain("<");
    expect(out).not.toContain("</script>");
    // And it is still the same data to a JSON parser.
    expect(JSON.parse(out).description).toBe('Nice phone</script><script>alert("x")</script>');
  });
});
