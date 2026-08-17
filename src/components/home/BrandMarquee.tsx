"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import type { Brand } from "@/data";

/**
 * An honest, endlessly-looping band of the six real brands on Soko — the
 * light direction's replacement for the deleted `OrbitingBrands` WebGL
 * scene (real logos billboarded around a distorted core). Same idea
 * (brand identity, always moving), none of the 3D.
 *
 * GSAP is used deliberately rather than a CSS `@keyframes` loop: the track
 * below renders two back-to-back copies of the brand list, and animating
 * `xPercent: -50` moves it by exactly one copy's width and repeats — no
 * `scrollWidth` measurement, no resize listener, seam always lands exactly
 * on the repeat regardless of viewport or logo aspect ratios. `useGSAP`
 * scopes the tween to the track ref and reverts it automatically on
 * unmount or when `reduceMotion` flips, so there's no manual cleanup here.
 */
export default function BrandMarquee({ brands }: { brands: Brand[] }) {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduceMotion || !trackRef.current) return;
      gsap.to(trackRef.current, {
        xPercent: -50,
        duration: brands.length * 5,
        ease: "none",
        repeat: -1,
      });
    },
    { scope: trackRef, dependencies: [reduceMotion] }
  );

  // Reduced motion: a single static row, wrapped, nothing duplicated —
  // there is nothing to loop, so there is nothing to fake a loop with.
  const items = reduceMotion ? brands : [...brands, ...brands];

  return (
    <div
      // Decorative reinforcement of the brand names already spelled out in
      // the hero paragraph above it — hidden from assistive tech rather
      // than announced twice (once plainly, once as a duplicated logo
      // strip). Each brand still gets a fully accessible card further down
      // the page (BrandCard / BrandGrid).
      aria-hidden="true"
      className="relative overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
      }}
    >
      <div
        ref={trackRef}
        className={
          reduceMotion
            ? "flex flex-wrap items-center justify-center gap-4"
            : "flex w-max flex-nowrap items-center gap-4"
        }
      >
        {items.map((brand, i) => (
          <div
            key={`${brand.id}-${i}`}
            className="relative h-16 w-32 shrink-0 rounded-2xl border border-border bg-surface-2 p-4 sm:h-20 sm:w-40"
          >
            <Image
              src={brand.logo}
              alt={brand.name}
              fill
              sizes="160px"
              className="object-contain p-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
