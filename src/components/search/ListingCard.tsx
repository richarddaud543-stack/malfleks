"use client";

import Link from "next/link";
import { motion } from "motion/react";
import ProductIcon from "@/components/product/ProductIcon";
import DeliveryBadge from "@/components/delivery/DeliveryBadge";
import { formatTZS } from "@/lib/format";
import type { Listing } from "@/lib/search";

/**
 * A search hit. Unlike `ProductCard`, this carries the brand and branch context
 * a customer needs when results span every brand and city at once.
 */
export default function ListingCard({ listing }: { listing: Listing }) {
  const { product, brand, branch } = listing;

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
        className="tint-glow glass-card flex h-full flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center"
        style={{ ["--tint" as string]: `${brand.accentColor}70` }}
      >
        <div
          className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl sm:h-20 sm:w-20"
          style={{ background: `${brand.accentColor}18` }}
        >
          <ProductIcon
            icon={product.image}
            className="h-12 w-12"
            style={{ color: brand.accentColor }}
          />
        </div>

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

        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
          <p className="font-semibold">{formatTZS(product.priceTZS)}</p>
          <div className="flex items-center gap-2">
            {!product.inStock && (
              <span className="text-[11px] text-muted">Out of stock</span>
            )}
            <DeliveryBadge deliveryOffered={branch.deliveryOffered} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
