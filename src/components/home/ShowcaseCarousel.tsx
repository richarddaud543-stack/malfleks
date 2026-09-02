"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import ProductIcon from "@/components/product/ProductIcon";
import { formatTZS } from "@/lib/format";
import { iconAccent } from "@/lib/accent";
// Catalogue records arrive as props from the server page. Nothing here reads
// the catalogue itself: this is a client component, and importing the arrays
// shipped every product in the browser bundle (debt #6).
import type { FeaturedItem } from "./featured";

const AUTOPLAY_MS = 4500;

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}

/**
 * MalFleks's take on Spline's auto-cycling template showcase: instead of design
 * templates, it cycles one real product from each brand on the platform —
 * the same "here's who's actually here, and what they sell" signal as the
 * brand grid above it, but slowed down to a single considered showcase
 * rather than a grid to scan.
 *
 * `prefers-reduced-motion` gets a genuinely different render, not just a
 * paused one: every item at once, in a plain static grid, with no carousel
 * chrome at all — nothing auto-advances, nothing is hidden behind paging
 * that would otherwise need controls to reach.
 */
export default function ShowcaseCarousel({ items }: { items: FeaturedItem[] }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Bumped by any manual navigation so the autoplay interval below restarts
  // its countdown instead of potentially firing again a moment later.
  const [tick, setTick] = useState(0);

  const paused = manuallyPaused || hovered;

  useEffect(() => {
    if (reduceMotion || paused || items.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => wrap(i + 1, items.length));
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [reduceMotion, paused, items.length, tick]);

  if (items.length === 0) return null;

  function goTo(next: number) {
    setIndex(wrap(next, items.length));
    setTick((t) => t + 1);
  }

  if (reduceMotion) {
    return (
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(({ brand, product }) => (
          <StaticShowcaseCard key={product.id} brand={brand} product={product} />
        ))}
      </div>
    );
  }

  const active = items[index];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHovered(false);
        }
      }}
    >
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured products, one per brand"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.product.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${items.length}: ${active.product.name} from ${active.brand.name}`}
          >
            <ShowcaseCard brand={active.brand} product={active.product} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <CarouselButton
          label="Previous featured product"
          onClick={() => goTo(index - 1)}
        >
          <ChevronIcon direction="left" />
        </CarouselButton>

        <div className="flex items-center gap-2 px-1">
          {items.map((item, i) => (
            <button
              key={item.product.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show ${item.product.name} from ${item.brand.name}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-foreground" : "w-2 bg-border hover:bg-muted"
              }`}
            />
          ))}
        </div>

        <CarouselButton label="Next featured product" onClick={() => goTo(index + 1)}>
          <ChevronIcon direction="right" />
        </CarouselButton>

        <CarouselButton
          label={manuallyPaused ? "Resume automatic rotation" : "Pause automatic rotation"}
          pressed={manuallyPaused}
          onClick={() => setManuallyPaused((p) => !p)}
          className="ml-2"
        >
          {manuallyPaused ? <PlayIcon /> : <PauseIcon />}
        </CarouselButton>
      </div>
    </div>
  );
}

function CarouselButton({
  label,
  onClick,
  children,
  pressed,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-foreground/20 hover:text-foreground ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** The interactive slide: subtle cursor-reactive tilt, restrained and mouse-only. */
function ShowcaseCard({ brand, product }: FeaturedItem) {
  const ref = useRef<HTMLDivElement>(null);
  const finePointer = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-60, 60], [5, -5]);
  const rotateY = useTransform(x, [-60, 60], [-5, 5]);

  useEffect(() => {
    // Guarded rather than assumed: every real browser this ships to has
    // `matchMedia`, but jsdom (this component's own unit tests) doesn't
    // implement it at all, and a bare call throws there.
    finePointer.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!finePointer.current) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <Link
      href={`/products/${product.id}`}
      className="perspective-1000 block"
    >
      {/* Split in two: the outer div owns the `--tint` custom property and
          the `tint-glow` hover shadow (plain CSS, no motion value involved),
          the inner `motion.div` owns the cursor-tilt transform. Framer's
          `MotionStyle` type doesn't mix cleanly with an arbitrary CSS custom
          property in the same style object without a cast, and splitting
          the two concerns is clearer anyway. */}
      <div
        className="tint-glow rounded-[1.75rem]"
        style={{ ["--tint" as string]: brand.accentColor } as React.CSSProperties}
      >
        <motion.div
          ref={ref}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ rotateX, rotateY }}
          className="glass-card preserve-3d grid gap-6 rounded-[1.75rem] p-8 transition-shadow sm:grid-cols-[auto_1fr] sm:items-center sm:p-10"
        >
          <ProductChip brand={brand} product={product} />
          <ProductDetails brand={brand} product={product} />
        </motion.div>
      </div>
    </Link>
  );
}

/** The reduced-motion equivalent: same content, no motion wrapper, no tilt. */
function StaticShowcaseCard({ brand, product }: FeaturedItem) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="glass-card flex flex-col items-center gap-3 rounded-2xl p-5 text-center transition-shadow hover:shadow-[0_0_40px_-12px_var(--accent)]"
    >
      <ProductIcon
        icon={product.image}
        className="h-12 w-12"
        style={{ color: iconAccent(brand.accentColor) }}
      />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {brand.name}
        </p>
        <h3 className="font-display mt-1 text-sm font-medium">{product.name}</h3>
        <p className="mt-1 text-xs font-semibold">{formatTZS(product.priceTZS)}</p>
      </div>
    </Link>
  );
}

function ProductChip({ brand, product }: FeaturedItem) {
  return (
    <div
      className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl sm:mx-0 sm:h-36 sm:w-36"
      style={{ background: `${brand.accentColor}18` }}
    >
      <ProductIcon
        icon={product.image}
        className="h-16 w-16 sm:h-20 sm:w-20"
        style={{ color: iconAccent(brand.accentColor) }}
      />
    </div>
  );
}

function ProductDetails({ brand, product }: FeaturedItem) {
  return (
    <div className="text-center sm:text-left">
      <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-muted sm:justify-start">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: brand.accentColor }}
        />
        {brand.name} · {product.category}
      </div>
      <h3 className="font-display mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
        {product.name}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{product.description}</p>
      <p className="mt-4 text-lg font-semibold">{formatTZS(product.priceTZS)}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
        View product <span aria-hidden="true">→</span>
      </span>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}
