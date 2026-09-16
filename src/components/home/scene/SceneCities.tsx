"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Branch, DeliveryAgent } from "@/data";
import { usePrefersReducedMotion, useSceneReveal } from "./useSceneTimeline";

/**
 * Scene 04 — the four cities.
 *
 * MalFleks is a Tanzanian marketplace and the old home page never said so past
 * the first paragraph. This scene is the place claim: four cities, what is
 * actually in each, and how many of those branches carry their own goods.
 *
 * Every number is derived from the real branch and courier lists. Writing
 * "19 branches" into the copy would be a fact with no owner — it would go
 * stale the first time MERCURY-06 deletes an unverified record, and nothing
 * would catch it.
 */
export default function SceneCities({
  branches,
  agents,
}: {
  branches: Branch[];
  agents: DeliveryAgent[];
}) {
  const scope = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  useSceneReveal(scope, reduced, { stagger: 0.06 });

  const cities = Array.from(new Set(branches.map((b) => b.city))).map((city) => {
    const inCity = branches.filter((b) => b.city === city);
    return {
      city,
      branches: inCity.length,
      fleet: inCity.filter((b) => b.deliveryOffered).length,
      couriers: agents.filter((a) => a.city === city).length,
    };
  });

  // The headline used to say "Four cities" outright — the number this scene
  // was designed around, not the number of cities MalFleks is actually in
  // yet. Spelled out the same way for any count so a single live city still
  // reads as a deliberate sentence, not a template with one blank filled in.
  const countWords = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  ];
  const cityCountWord =
    cities.length < countWords.length ? countWords[cities.length] : String(cities.length);

  // The grid used to be a fixed sm:grid-cols-2 lg:grid-cols-4, which drew the
  // hairline-grid background through three empty column tracks whenever
  // fewer than four cities had real branches — visible today, at one city,
  // as a large blank panel next to Dodoma's card. Capping the column count at
  // what actually has data removes the empty tracks entirely; a real fifth
  // city still wraps onto a second row at four columns.
  const gridColsClass =
    cities.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : cities.length === 3
        ? "sm:grid-cols-3"
        : cities.length === 2
          ? "sm:grid-cols-2"
          : "";

  return (
    <section ref={scope} className="relative px-5 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p data-reveal className="scene-eyebrow">
              04 — Where
            </p>
            <h2 data-reveal className="scene-display-sm mt-5 max-w-2xl">
              {cityCountWord} {cities.length === 1 ? "city" : "cities"},{" "}
              <em className="scene-serif">counted</em>
            </h2>
          </div>
          <Link
            data-reveal
            href="/locator"
            className="scene-chip px-6 py-3 text-sm"
          >
            Open the map
          </Link>
        </div>

        <ul
          className={`mt-14 grid gap-px overflow-hidden rounded-3xl ${gridColsClass}`}
          style={{ background: "var(--scene-hairline)" }}
        >
          {cities.map((entry) => (
            <li
              key={entry.city}
              data-reveal
              className="p-8"
              style={{ background: "var(--scene-raised)" }}
            >
              <p className="scene-eyebrow">{entry.city}</p>
              <p
                className="scene-num mt-6 text-5xl"
                style={{ color: "var(--scene-ink)" }}
              >
                {entry.branches}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--scene-muted)" }}>
                {entry.branches === 1 ? "branch" : "branches"}
              </p>

              <hr aria-hidden className="scene-rule my-6" />

              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt style={{ color: "var(--scene-muted)" }}>Own fleet</dt>
                  <dd className="scene-num" style={{ color: "var(--scene-mint)" }}>
                    {entry.fleet}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt style={{ color: "var(--scene-muted)" }}>Couriers</dt>
                  <dd className="scene-num" style={{ color: "var(--scene-lime)" }}>
                    {entry.couriers}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
