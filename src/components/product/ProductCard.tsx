/// <reference types="react/canary" />
"use client";

// See ListingCard.tsx for why this is a triple-slash reference rather than
// `import {} from "react/canary"` — that form 500s under `next dev`/Turbopack.
import Link from "next/link";
import { useRef, ViewTransition } from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import type { Product } from "@/data";
import ProductIcon from "./ProductIcon";
import { formatTZS } from "@/lib/format";
import { iconAccent } from "@/lib/accent";

export default function ProductCard({
  product,
  accentColor,
}: {
  product: Product;
  accentColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-40, 40], [8, -8]);
  const rotateY = useTransform(x, [-40, 40], [-8, 8]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  function handleGlowEnter(e: React.MouseEvent<HTMLDivElement>) {
    e.currentTarget.style.boxShadow = `0 24px 60px -24px ${accentColor}70`;
    e.currentTarget.style.borderColor = `${accentColor}55`;
  }

  function handleGlowLeave(e: React.MouseEvent<HTMLDivElement>) {
    e.currentTarget.style.boxShadow = "";
    e.currentTarget.style.borderColor = "";
    handleMouseLeave();
  }

  return (
    <Link
      href={`/products/${product.id}`}
      transitionTypes={["product-view"]}
      className="perspective-1000 block"
    >
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleGlowEnter}
        onMouseLeave={handleGlowLeave}
        style={{ rotateX, rotateY }}
        className="glass-card preserve-3d rounded-2xl p-5 transition-[box-shadow,border-color] duration-300"
      >
        {/* Scoped to the "product-view" transition type — see ListingCard.tsx
            for why the plain zero-config morph isn't used here. This grid has
            no filter UI today, so there's no proven same-page collision the
            way /search has, but matching the same scoping keeps both card
            components (and their shared destination) behaving identically
            rather than one being coincidentally safe. */}
        <ViewTransition
          name={`product-${product.id}`}
          enter={{ "product-view": "auto", default: "none" }}
          exit={{ "product-view": "auto", default: "none" }}
          update="none"
        >
          <div
            className="flex h-32 items-center justify-center rounded-xl"
            style={{ background: `${accentColor}18` }}
          >
            <ProductIcon
              icon={product.image}
              className="h-16 w-16"
              style={{ color: iconAccent(accentColor) }}
            />
          </div>
        </ViewTransition>
        <div className="mt-4 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-medium">{product.name}</h3>
            <p className="text-xs text-muted">{product.category}</p>
          </div>
          {!product.inStock && (
            <span className="shrink-0 text-[11px] text-muted">
              Out of stock
            </span>
          )}
        </div>
        <p className="mt-3 text-sm font-semibold">
          {formatTZS(product.priceTZS)}
        </p>
      </motion.div>
    </Link>
  );
}
