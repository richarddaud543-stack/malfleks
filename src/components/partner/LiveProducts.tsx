import { PARTNER } from "@/i18n/copy/partner";
import type { Locale } from "@/i18n/locale";
import Link from "next/link";

import { formatTZS } from "@/lib/format";
import type { LiveProduct } from "@/server/partners/stock";
import StockToggle from "./StockToggle";

/**
 * "{copy.heading}": what this branch has on the shop right now, and
 * whether each one can be ordered.
 *
 * Separate from the submissions table above it on purpose. That table is the
 * history of what was *proposed* — pending, published, sent back. This is
 * what a customer can *see*, which is the list a shopkeeper needs when the
 * last one has just gone out of the door. Only the stock switch is here;
 * a new name or price still goes through review.
 *
 * A server component: the rows have been through `listLiveProductsForBranch`,
 * scoped to the session's own branch, by the time they arrive. Only the
 * switch itself is interactive.
 */
export default function LiveProducts({
  products,
  canChange,
  locale = "en",
}: {
  products: LiveProduct[];
  /** False for a suspended partner, who may look but not change anything. */
  canChange: boolean;
  locale?: Locale;
}) {
  const copy = PARTNER[locale].live;

  return (
    <section aria-labelledby="live-products-heading" className="mt-12">
      <h2
        id="live-products-heading"
        className="font-display text-lg font-medium tracking-tight"
      >
        {copy.heading}
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {copy.intro}
      </p>

      {products.length === 0 ? (
        <p className="glass-card mt-5 rounded-2xl px-6 py-8 text-sm text-muted">
          {copy.empty}
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {products.map((product) => (
            <li
              key={product.id}
              className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <Link
                    href={`/products/${product.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {product.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-sm text-muted tabular-nums">
                  {formatTZS(product.priceTZS)}
                </p>
              </div>
              {canChange ? (
                <StockToggle
                  productId={product.id}
                  productName={product.name}
                  inStock={product.inStock}
                />
              ) : (
                <p className="text-sm text-muted">
                  {product.inStock ? copy.inStock : copy.outOfStock}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
