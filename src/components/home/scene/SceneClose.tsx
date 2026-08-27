"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePrefersReducedMotion, useSceneReveal } from "./useSceneTimeline";

/**
 * Scene 05 — the close.
 *
 * The quiet moment the research asks for: after the rail's pinned horizontal
 * travel, the page stops moving and asks for one thing. Two links, no motion
 * beyond a single arrival.
 *
 * The partner line is deliberately plain about how joining works, because
 * `docs/marketplace-model.md` is: partners apply and an admin approves them,
 * there is no self-serve signup, and the page should not imply one.
 */
export default function SceneClose() {
  const scope = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  useSceneReveal(scope, reduced, { start: "top 85%", stagger: 0.09 });

  return (
    <section ref={scope} className="scene-grain relative overflow-hidden px-5 py-32 sm:py-40">
      <div
        aria-hidden
        className="scene-glow left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2"
        style={{ background: "var(--scene-mint)", opacity: 0.1 }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <p data-reveal className="scene-eyebrow">
          05 — Start
        </p>
        <h2 data-reveal className="scene-display-sm mt-6">
          Find it, then find out{" "}
          <em className="scene-serif">who brings it</em>
        </h2>
        <p
          data-reveal
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed"
          style={{ color: "var(--scene-muted)" }}
        >
          Search the whole catalogue, or open the map and see which branches
          are near you.
        </p>
        <div
          data-reveal
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Link href="/search" className="scene-cta px-8 py-4 text-sm">
            Search the marketplace
          </Link>
          <Link href="/brands" className="scene-chip px-8 py-4 text-sm">
            Browse by brand
          </Link>
        </div>
        <p data-reveal className="mt-12 text-sm" style={{ color: "var(--scene-muted)" }}>
          Run a branch or a courier service?{" "}
          <Link
            href="/apply"
            className="underline underline-offset-4"
            style={{ color: "var(--scene-lime)" }}
          >
            Apply to join
          </Link>{" "}
          — applications are reviewed by hand.
        </p>
      </div>
    </section>
  );
}
