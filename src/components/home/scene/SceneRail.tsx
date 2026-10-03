"use client";

import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import ProductIcon from "@/components/product/ProductIcon";
import ProductPhoto from "@/components/product/ProductPhoto";
import { formatTZS } from "@/lib/format";
import type { FeaturedItem } from "@/components/home/featured";
import { usePrefersReducedMotion } from "./useSceneTimeline";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scene 04 — the catalogue, as a scroll-driven rail.
 *
 * The section pins and vertical scroll drives the rail sideways. This is the
 * one genuinely scroll-*linked* effect on the page, and it is here rather than
 * anywhere else because it is the only place where the horizontal motion says
 * something true: the catalogue is wide, and you are moving along it.
 *
 * Three things keep this from being the cliché version:
 *
 * 1. **It is bounded.** The pin lasts exactly as long as the rail is wide,
 *    computed from the real element, so it never holds the page hostage.
 * 2. **`invalidateOnRefresh`** recomputes that distance on resize. A pinned
 *    horizontal scroll whose distance was measured once at 1440px is broken
 *    on rotate, and it is the most common bug in this pattern.
 * 3. **It degrades to an ordinary scroller.** Under `prefers-reduced-motion`
 *    no ScrollTrigger is created at all and the rail becomes a plain
 *    horizontally-scrollable list, which is still fully usable — including by
 *    keyboard, since every card is a real link and focusing one scrolls it
 *    into view natively. A pinned rail that traps keyboard users is a defect,
 *    not a flourish.
 */
export default function SceneRail({ items }: { items: FeaturedItem[] }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      const el = track.current;
      const wrap = section.current;
      if (!el || !wrap) return;

      // Nothing to travel: fewer cards than fill the viewport.
      const distance = () => Math.max(0, el.scrollWidth - window.innerWidth + 80);
      if (distance() <= 0) return;

      const tween = gsap.to(el, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: wrap,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    },
    { scope: section, dependencies: [reduced, items.length] },
  );

  return (
    <section
      ref={section}
      className="relative overflow-hidden py-24"
      aria-labelledby="scene-rail-heading"
    >
      <div className="mx-auto max-w-6xl px-5">
        <p className="scene-eyebrow">04 — The catalogue</p>
        <h2 id="scene-rail-heading" className="scene-display-sm mt-5 max-w-3xl">
          One pick from <em className="scene-serif">every</em> brand
        </h2>
      </div>

      {/* Markup is identical in both modes on purpose — see the note in
          globals.css. CSS decides whether the viewport scrolls; JS decides
          only whether a ScrollTrigger exists, and that happens after mount. */}
      <div className="scene-rail-viewport mt-14">
        <div ref={track} className="scene-rail-track gap-5 px-5">
          {items.map(({ brand, product }) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="scene-panel group w-[78vw] shrink-0 p-7 transition-colors sm:w-[420px]"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="scene-eyebrow">{brand.name}</p>
                <p className="scene-eyebrow">{product.category}</p>
              </div>

              {/* Deliberately NOT tinted with `brand.accentColor`.
                  `iconAccent()` in src/lib/accent.ts searches for a passing
                  variant against the *light* page ground, which this scene is
                  not — reusing it here would produce a number that means
                  nothing. Rather than open a second contrast search for a
                  decorative tile, the icon takes the scene's own mint (computed
                  at 15.29:1 on this ground) and the brand is identified by its
                  name above. One accent per moment, which is the restraint
                  docs/research/motion-dev-design.md found in motion.dev's UI. */}
              {/* A real photo, when the product has one, in the same square
                  frame as everywhere else — sized to the tile's height and
                  centred, so a card with a photo is exactly as tall as one
                  without and the rail's measured width does not change. */}
              <div
                className="mt-7 flex h-40 items-center justify-center overflow-hidden rounded-2xl"
                style={{ background: "var(--scene-ground)" }}
              >
                <ProductPhoto
                  src={product.photoUrl}
                  alt={product.name}
                  sizes="160px"
                  className="h-40 w-40"
                  fallback={
                    <ProductIcon
                      icon={product.image}
                      className="h-20 w-20"
                      style={{ color: "var(--scene-mint)" }}
                    />
                  }
                />
              </div>

              <h3 className="mt-7 text-xl font-medium">{product.name}</h3>
              <p
                className="scene-num mt-2 text-lg"
                style={{ color: "var(--scene-mint)" }}
              >
                {formatTZS(product.priceTZS)}
              </p>
              <p
                className="mt-4 text-sm underline-offset-4 group-hover:underline group-focus-visible:underline"
                style={{ color: "var(--scene-lime)" }}
              >
                View product →
              </p>
              </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
