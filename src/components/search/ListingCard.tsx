/// <reference types="react/canary" />
"use client";

// The reference above is a compile-time-only pragma (never emitted as a real
// import) that loads the `react/canary` ambient types declaring
// `ViewTransition` — App Router runs on React canary at build time via
// Next's own aliasing, but @types/react only ships this surface behind this
// opt-in. `import {} from "react/canary"` is the form @types/react's own
// docs suggest, but Turbopack tries to resolve it as a real module (there is
// none, only a "types" export condition) and 500s every route that imports
// this file — verified against a running `next dev`.
import Link from "next/link";
import { ViewTransition } from "react";
import { motion } from "motion/react";
import ProductIcon from "@/components/product/ProductIcon";
import DeliveryRouteLine from "@/components/delivery/DeliveryRouteLine";
import { formatTZS } from "@/lib/format";
import { iconAccent } from "@/lib/accent";
import { previewDelivery } from "@/lib/order";
import type { Listing } from "@/lib/search";

/**
 * A search hit. Unlike `ProductCard`, this carries the brand and branch context
 * a customer needs when results span every brand and city at once.
 */
export default function ListingCard({ listing }: { listing: Listing }) {
  const { product, brand, branch } = listing;
  // A `Listing` is exactly the {product, brand, branch} join `previewDelivery`
  // wants, so the routing rule answers here — on the card the customer is
  // choosing from — instead of two pages later on /delivery.
  // `listing.agents` is the database set attached by `buildListings`; without
  // it `previewDelivery` falls back to the static couriers and can name the
  // wrong carrier on a real branch.
  const outlook = previewDelivery(listing);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <Link
        href={`/products/${product.id}`}
        data-testid="search-result"
        transitionTypes={["product-view"]}
        className="tint-glow glass-card flex h-full flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center"
        style={{ ["--tint" as string]: `${brand.accentColor}70` }}
      >
        {/* Scoped to the "product-view" transition type tagged on the Link
            above, via the object form of `enter`/`exit` — not the plain
            zero-config morph from the docs' Step 1. Left unscoped, this also
            fires during same-page filter updates on /search
            (`SearchExplorer`'s `commit` wraps `router.replace` in
            `startTransition`, which activates named ViewTransitions the same
            as a real navigation does), fighting the `motion.div layout`
            animation that already choreographs reordering above.
            `update="none"` closes the other half of that gap: a card that
            stays mounted but moves to a new slot when the filtered set
            reorders hits the "update" condition, not "enter"/"exit", so it
            needs its own suppression.
            Verified against a running `next build`/`next start` with
            `document.startViewTransition` patched: the plain zero-config
            morph — and even this scoped version without `update="none"` —
            both fire during a facet-chip click; this exact combination does
            not, and still fires correctly on the real navigation. */}
        <ViewTransition
          name={`product-${product.id}`}
          enter={{ "product-view": "auto", default: "none" }}
          exit={{ "product-view": "auto", default: "none" }}
          update="none"
        >
          <div
            className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl sm:h-20 sm:w-20"
            style={{ background: `${brand.accentColor}18` }}
          >
            <ProductIcon
              icon={product.image}
              className="h-12 w-12"
              style={{ color: iconAccent(brand.accentColor) }}
            />
          </div>
        </ViewTransition>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: brand.accentColor }}
            />
            <span className="truncate">{brand.name}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{product.category}</span>
          </div>

          <h3 className="font-display mt-1 truncate text-base font-medium">
            {product.name}
          </h3>

          <p className="mt-1 truncate text-xs text-muted">
            {branch.name} — {branch.city}
          </p>
        </div>

        {/* The route line absorbed the separate "Out of stock" note that used
            to sit beside the badge: out of stock *is* one of the states it
            renders, and showing both put two competing availability claims a
            few pixels apart. */}
        <div className="flex shrink-0 items-start justify-between gap-3 sm:flex-col sm:items-end">
          <p className="font-semibold">{formatTZS(product.priceTZS)}</p>
          <DeliveryRouteLine outlook={outlook} className="sm:items-end" />
        </div>
      </Link>
    </motion.div>
  );
}
