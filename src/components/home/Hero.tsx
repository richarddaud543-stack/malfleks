"use client";

import Link from "next/link";
import ScrollStagger from "@/components/motion/ScrollStagger";
import AmbientBlob from "./AmbientBlob";
import BrandMarquee from "./BrandMarquee";
import { brands, branches } from "@/data";

/**
 * The homepage hero for the light direction. Replaces the deleted
 * `HeroScene`/`HeroSceneLoader` WebGL pair (a `MeshDistortMaterial`
 * icosahedron with brand logos billboarded in orbit around it) with an
 * editorial composition built entirely from real data: an oversized
 * headline, one unambiguous lime CTA, and a looping band of the six actual
 * brand logos on Soko underneath — the same "who's actually here" signal
 * the WebGL scene was reaching for, minus the jelly globe.
 *
 * A client component (not `src/app/page.tsx` itself) purely so the ambient
 * blobs and marquee can read `prefers-reduced-motion` — the rest of the
 * homepage stays server-rendered.
 *
 * The badge, headline, paragraph, CTA row and marquee panel used to be five
 * independent `ScrollReveal`s, each timed by its own manually-picked delay.
 * They're now five `data-reveal` targets under one `ScrollStagger`: a single
 * arrival, cascading top to bottom in document order, rather than five
 * separately-triggered fades that happen to land in a similar sequence.
 */
export default function Hero() {
  const cityCount = new Set(branches.map((b) => b.city)).size;

  return (
    <section className="relative overflow-hidden">
      <AmbientBlob className="h-[420px] w-[420px] bg-accent/25 -left-32 -top-32" />
      <AmbientBlob
        className="h-[380px] w-[380px] bg-accent-2/20 -right-24 top-10"
        style={{ animationDelay: "-6s" }}
      />
      <AmbientBlob
        className="h-[320px] w-[320px] bg-accent-3/15 left-1/3 bottom-0"
        style={{ animationDelay: "-11s" }}
      />
      <div className="bg-grid absolute inset-0 h-[640px]" />

      <ScrollStagger start="top 95%">
        <div className="relative mx-auto max-w-3xl px-5 pb-6 pt-20 text-center sm:pt-24 lg:pt-28">
          <span
            data-reveal
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Now live across Tanzania
          </span>

          <h1
            data-reveal
            className="mt-6 font-display text-6xl font-medium leading-[0.93] tracking-tight sm:text-7xl lg:text-8xl"
          >
            Every brand
            <br />
            branch.{" "}
            <span className="font-accent-serif italic text-gradient">
              One
            </span>
            <br />
            delivery promise.
          </h1>

          <p
            data-reveal
            className="mx-auto mt-6 max-w-xl text-base text-muted sm:text-lg"
          >
            Browse authorized branches from Toyota, Ford, BMW, Oraimo, Apple
            and Halotel. If the branch delivers, we route your order
            straight to them — if not, we connect you to a trusted local
            courier automatically.
          </p>

          <div data-reveal>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/brands"
                className="btn-pill btn-lime px-7 py-3.5 text-base"
              >
                Explore brands
              </Link>
              <Link
                href="/search"
                className="btn-pill btn-ink px-7 py-3.5 text-base"
              >
                Search products
              </Link>
            </div>
            <Link
              href="/agents"
              className="mt-5 inline-block text-sm font-medium text-muted underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              Or find a delivery agent near you →
            </Link>
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-5 pb-16 sm:pb-20 lg:pb-24">
          <div data-reveal className="panel px-5 py-7 sm:px-8 sm:py-9">
            <p className="text-center text-xs font-medium uppercase tracking-widest text-muted">
              {brands.length} brands · {branches.length} branches ·{" "}
              {cityCount} cities
            </p>
            <div className="mt-6">
              <BrandMarquee />
            </div>
          </div>
        </div>
      </ScrollStagger>
    </section>
  );
}
