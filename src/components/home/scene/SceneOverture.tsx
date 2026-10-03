"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Brand, Branch } from "@/data";
import DispatchField from "./DispatchField";
import { usePrefersReducedMotion, useOverture } from "./useSceneTimeline";

/**
 * Scene 01 — the overture.
 *
 * The headline is `docs/marketplace-model.md`'s own first sentence: MalFleks is
 * "a shop window for the whole city." Using the founder's framing rather than
 * inventing marketing copy is the "art direction with a point of view" the
 * research asks for — the page argues the same thing the business does.
 *
 * Each line is its own mask (`.scene-line`) so the timeline can stagger them.
 * The resting CSS state is the animated-OUT state, which means the no-JS and
 * reduced-motion escape hatches in globals.css are load-bearing, not polish.
 */
export default function SceneOverture({
  brands,
  branches,
}: {
  brands: Brand[];
  branches: Branch[];
}) {
  const scope = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  useOverture(scope, reduced);

  const cities = Array.from(new Set(branches.map((b) => b.city)));
  const fleet = branches.filter((b) => b.deliveryOffered).length;

  // Named once, from the real branch list — not a fixed four-city claim.
  // `SceneCities` below makes the same argument in its own comment: a
  // hardcoded place name is a fact with no owner, and the first city this
  // scene named that MalFleks hadn't actually reached yet was exactly that.
  const cityList =
    cities.length === 0
      ? "Tanzania"
      : cities.length === 1
        ? cities[0]
        : `${cities.slice(0, -1).join(", ")} and ${cities[cities.length - 1]}`;

  const stats = [
    { value: brands.length, label: brands.length === 1 ? "brand" : "brands" },
    {
      value: branches.length,
      label: branches.length === 1 ? "branch" : "branches",
    },
    { value: cities.length, label: cities.length === 1 ? "city" : "cities" },
    { value: `${fleet}/${branches.length}`, label: "own fleet" },
  ];

  return (
    <section
      ref={scope}
      className="scene-grain relative overflow-hidden px-5 pb-24 pt-32 sm:pb-32 sm:pt-40"
    >
      {/* Dispatch Fields — see docs/design/dispatch-fields.md. Drawn once,
          no dependency, no animation loop. Sits behind the glows so the
          ambient light reads as atmosphere over it rather than beside it. */}
      <DispatchField seed={20260827} />

      <div
        data-scene-glow
        aria-hidden
        className="scene-glow left-[-10%] top-[6%] h-[420px] w-[420px]"
        style={{ background: "var(--scene-mint)", opacity: 0.16 }}
      />
      <div
        data-scene-glow
        aria-hidden
        className="scene-glow right-[-6%] top-[38%] h-[360px] w-[360px]"
        style={{ background: "var(--scene-lime)", opacity: 0.12 }}
      />

      <div className="relative mx-auto max-w-6xl">
        <p data-scene-fade className="scene-eyebrow">
          01 — Tanzania
        </p>

        <h1 className="scene-display mt-7">
          <span data-scene-line className="scene-line">
            <span>A shop window</span>
          </span>
          <span data-scene-line className="scene-line">
            <span>
              for the <em className="scene-serif not-italic italic">whole</em>
            </span>
          </span>
          <span data-scene-line className="scene-line">
            <span>city.</span>
          </span>
        </h1>

        <hr
          data-scene-rule
          aria-hidden
          className="scene-rule mt-12"
          style={{ borderColor: "var(--scene-hairline)" }}
        />

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <p
            data-scene-fade
            className="max-w-xl text-lg leading-relaxed"
            style={{ color: "var(--scene-muted)" }}
          >
            The shops and the couriers already exist, out in {cityList}.
            MalFleks puts them behind one window, and holds your payment
            until your order reaches you.
          </p>

          <div className="flex flex-wrap items-start gap-x-10 gap-y-6 lg:justify-end">
            {stats.map((stat) => (
              <div key={stat.label} data-scene-settle>
                <p
                  className="scene-num text-3xl"
                  style={{ color: "var(--scene-mint)" }}
                >
                  {stat.value}
                </p>
                <p className="scene-eyebrow mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div data-scene-fade className="mt-12 flex flex-wrap items-center gap-3">
          <Link href="/search" className="scene-cta px-7 py-3.5 text-sm">
            Search the marketplace
          </Link>
          <Link href="/locator" className="scene-chip px-7 py-3.5 text-sm">
            Find a branch near you
          </Link>
        </div>
      </div>
    </section>
  );
}
