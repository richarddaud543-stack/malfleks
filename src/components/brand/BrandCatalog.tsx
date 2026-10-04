"use client";

import { useLocale } from "@/i18n/client";
import { PLACES } from "@/i18n/copy/places";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Brand, Branch, BrandCategory } from "@/data";
import BrandGrid from "./BrandGrid";

const CATEGORY_ORDER: (BrandCategory | "all")[] = ["all", "automotive", "electronics", "telecom"];

/**
 * The active category's pill background slides between buttons via Motion's
 * shared-layout animation (`layoutId`) rather than each button fading its
 * own background in and out independently — motion.dev's own homepage names
 * this capability directly ("Layout animation: animate between any two
 * layouts with a single `layout` prop"; see
 * docs/research/motion-dev-design.md). `useReducedMotion()` collapses the
 * transition to duration 0 — the pill still relocates instantly to the new
 * active button on every input method, it just doesn't glide there.
 *
 * The inactive-state border was a dark-theme leftover this pass also fixes:
 * `hover:border-white/30` is invisible on the light ground (white on
 * white) — a real, shipped bug, not just a spot to add motion.
 */
export default function BrandCatalog({
  brands,
  branchesByBrandId,
}: {
  brands: Brand[];
  branchesByBrandId: Record<string, Branch[]>;
}) {
  const [active, setActive] = useState<BrandCategory | "all">("all");
  const reduceMotion = useReducedMotion();
  const locale = useLocale();
  const copy = PLACES[locale].brands;
  const categories = CATEGORY_ORDER.map((value) => ({
    value,
    label: value === "all" ? copy.all : copy.categories[value],
  }));

  const filtered =
    active === "all" ? brands : brands.filter((b) => b.category === active);

  // A chip for a kind of brand nobody on MalFleks is yet ("Automotive", with
  // two electronics shops live) filters to an empty page. Offer only the
  // kinds that have a brand in them, and no chips at all when there would be
  // nothing to choose between.
  const present = new Set(brands.map((b) => b.category));
  const offered = categories.filter((c) => c.value === "all" || present.has(c.value));
  const showChips = offered.length > 2;

  return (
    <div>
      {showChips && (
      <div className="flex flex-wrap gap-2">
        {offered.map((c) => {
          const isActive = active === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setActive(c.value)}
              aria-current={isActive ? "true" : undefined}
              className={`relative rounded-full border px-4 py-1.5 text-sm transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : "border-border text-muted hover:border-foreground/30 hover:text-foreground focus-visible:border-foreground/30"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="category-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-accent/15"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 32 }
                  }
                />
              )}
              {c.label}
            </button>
          );
        })}
      </div>
      )}
      <div className={showChips ? "mt-8" : ""}>
        <BrandGrid brands={filtered} branchesByBrandId={branchesByBrandId} locale={locale} />
      </div>
    </div>
  );
}
