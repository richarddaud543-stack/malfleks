/// <reference types="react/canary" />
"use client";

// See ListingCard.tsx for why this is a triple-slash reference rather than
// `import {} from "react/canary"` — that form 500s under `next dev`/Turbopack.
import Link from "next/link";
import { useRef, useState, ViewTransition } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { Product } from "@/data";
import ProductIcon from "./ProductIcon";
import ProductPhoto from "./ProductPhoto";
import { formatTZS } from "@/lib/format";
import { iconAccent } from "@/lib/accent";
import { useLocale } from "@/i18n/client";
import { categoryLabel, SHOP } from "@/i18n/copy/shop";

// The same cursor-follow spring MagneticButton.tsx uses, so every
// pointer-tracked element in the app shares one physical feel rather than
// each inventing its own stiffness/damping.
const tiltSpring = { stiffness: 300, damping: 20, mass: 0.4 };

export default function ProductCard({
  product,
  accentColor,
}: {
  product: Product;
  accentColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const locale = useLocale();
  const [active, setActive] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Raw pointer position eased through a spring before it drives rotation,
  // rather than mapped 1:1 — motion.dev's own homepage names this pattern
  // directly ("05 Spring physics: real spring math for animations that
  // naturally react to user input"; docs/research/motion-dev-design.md).
  // The tilt eases toward the cursor instead of snapping to every pixel.
  const springX = useSpring(x, tiltSpring);
  const springY = useSpring(y, tiltSpring);
  const rotateX = useTransform(springY, [-40, 40], [8, -8]);
  const rotateY = useTransform(springX, [-40, 40], [-8, 8]);

  function handleMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    if (reduceMotion) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  }

  function resetTilt() {
    x.set(0);
    y.set(0);
  }

  return (
    <Link
      href={`/products/${product.id}`}
      transitionTypes={["product-view"]}
      className="perspective-1000 block"
      // The glow/tilt affordance lives on this Link, not the inner
      // motion.div: this is the element that's actually focusable and the
      // one whose hover area covers the whole card, so hover, keyboard
      // focus and (via whileTap below) touch/pointer press all drive the
      // same `active` state — "nothing hover-only" applies to 3D motion
      // exactly as much as it does to colour.
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => {
        setActive(false);
        resetTilt();
      }}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <motion.div
        ref={ref}
        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        style={{
          rotateX,
          rotateY,
          boxShadow:
            active && !reduceMotion
              ? `0 24px 60px -24px ${accentColor}70`
              : undefined,
          borderColor: active ? `${accentColor}55` : undefined,
        }}
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
          {/* One wrapper either way, so the transition above always has a
              single node. A real photo gets the shared square frame — whole
              photo visible, nothing cropped to fit a banner — and the tinted
              icon tile is what shows when there is no photo or it fails to
              load. `sizes` follows `ProductGrid`: two columns on a phone,
              three from `sm`, four from `lg`. */}
          <div className="overflow-hidden rounded-xl">
            <ProductPhoto
              src={product.photoUrl}
              alt={product.name}
              sizes="(min-width: 1024px) 260px, (min-width: 640px) 33vw, 50vw"
              className="w-full"
              fallback={
                <div
                  className="flex h-32 items-center justify-center"
                  style={{ background: `${accentColor}18` }}
                >
                  <ProductIcon
                    icon={product.image}
                    className="h-16 w-16"
                    style={{ color: iconAccent(accentColor) }}
                  />
                </div>
              }
            />
          </div>
        </ViewTransition>
        <div className="mt-4 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-medium">{product.name}</h3>
            <p className="text-xs text-muted">{categoryLabel(product.category, locale)}</p>
          </div>
          {!product.inStock && (
            <span className="shrink-0 text-[11px] text-muted">
              {SHOP[locale].product.outOfStock}
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
