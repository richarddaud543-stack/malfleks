"use client";

import { useRef } from "react";
import type { Branch } from "@/data";
import { usePrefersReducedMotion, useSceneReveal } from "./useSceneTimeline";

/**
 * Scene 02 — the rule.
 *
 * This is the scene the whole redesign exists for. MalFleks's product is not the
 * catalogue, it is one boolean on a branch: `deliveryOffered`. Four lines of
 * `resolveDeliveryRoute()` decide whether the brand carries the order or a
 * local courier does, and every other feature is downstream of that.
 *
 * The old home page buried it in a pair of "How delivery works" cards below
 * the fold. Here it is the second thing anyone sees, drawn as the fork it
 * actually is — which is what "art direction with a point of view" means in
 * practice: the page is organised around the idea, not around the sections.
 *
 * The counts are computed from the real branch list, never hardcoded, so this
 * scene cannot drift away from the catalogue the way a written-down "6 of 19"
 * would.
 */
export default function SceneRule({ branches }: { branches: Branch[] }) {
  const scope = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  useSceneReveal(scope, reduced, { stagger: 0.1 });

  const fleet = branches.filter((b) => b.deliveryOffered);
  const courier = branches.filter((b) => !b.deliveryOffered);

  const branchesOf = (n: number) => `${n} of ${branches.length} branches`;

  return (
    <section ref={scope} className="relative px-5 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <p data-reveal className="scene-eyebrow">
          02 — The rule
        </p>
        <h2 data-reveal className="scene-display-sm mt-5 max-w-3xl">
          One question, asked at{" "}
          <em className="scene-serif">every branch</em>
        </h2>
        <p
          data-reveal
          className="mt-5 max-w-2xl text-lg leading-relaxed"
          style={{ color: "var(--scene-muted)" }}
        >
          Does this branch run its own delivery? Everything MalFleks does follows
          from the answer — and you see it before you commit, not after.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <article data-reveal className="scene-panel p-8 sm:p-10">
            <div className="flex items-baseline justify-between gap-4">
              <p className="scene-eyebrow" style={{ color: "var(--scene-mint)" }}>
                Yes
              </p>
              <p className="scene-num text-sm" style={{ color: "var(--scene-muted)" }}>
                {branchesOf(fleet.length)}
              </p>
            </div>
            <h3
              className="scene-display-sm mt-6"
              style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", color: "var(--scene-mint)" }}
            >
              The brand carries it
            </h3>
            <p className="mt-4 leading-relaxed" style={{ color: "var(--scene-muted)" }}>
              The branch owns the goods and its own fleet. No third-party
              handoff, and no invented delivery estimate — brands do not quote
              one, so MalFleks does not print one.
            </p>
          </article>

          <article data-reveal className="scene-panel p-8 sm:p-10">
            <div className="flex items-baseline justify-between gap-4">
              <p className="scene-eyebrow" style={{ color: "var(--scene-lime)" }}>
                No
              </p>
              <p className="scene-num text-sm" style={{ color: "var(--scene-muted)" }}>
                {branchesOf(courier.length)}
              </p>
            </div>
            <h3
              className="scene-display-sm mt-6"
              style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", color: "var(--scene-lime)" }}
            >
              A local courier does
            </h3>
            <p className="mt-4 leading-relaxed" style={{ color: "var(--scene-muted)" }}>
              MalFleks matches a vetted courier serving that branch&apos;s city.
              Couriers <em className="scene-serif">do</em> publish a time, so
              the estimate you see is theirs.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
