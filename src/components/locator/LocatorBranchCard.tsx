import BrandLogo from "@/components/brand/BrandLogo";
import Link from "next/link";
import DeliveryBadge from "@/components/delivery/DeliveryBadge";
import type { LocatorBranch } from "./locator";

/**
 * A branch seen from outside its brand. `BranchCard` can assume you already
 * know whose showroom you are looking at; here the results span six brands at
 * once, so the logo and accent colour have to carry that identity.
 */
export default function LocatorBranchCard({
  entry,
  active = false,
}: {
  entry: LocatorBranch;
  /** True while this card's city is "paired" with a hovered/focused marker
   *  on the map — see CityLocator, which owns the shared pairing state. */
  active?: boolean;
}) {
  const { branch, brand } = entry;

  return (
    <Link
      href={`/brands/${brand.slug}/branches/${branch.id}`}
      data-testid="locator-branch"
      // Lift and tilt live in `.tint-glow` alone (globals.css), same as
      // BrandCard and BranchCard — a Tailwind `hover:-translate-y-*` here
      // would set `transform` too and win the cascade, costing the tilt and
      // leaving keyboard focus with no lift at all. The paired state travels
      // as `data-paired` so that rule can own its transform as well; only
      // the accent ring, which nothing else in the class needs, stays inline.
      data-paired={active ? "true" : undefined}
      className="tint-glow glass-card flex gap-4 rounded-2xl p-4 hover:border-foreground/20 focus-visible:border-foreground/20"
      style={{
        ["--tint" as string]: `${brand.accentColor}70`,
        ...(active
          ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" }
          : {}),
      }}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2"
        style={{ boxShadow: `0 0 0 1px ${brand.accentColor}55` }}
      >
        {/* Decorative: the brand name is spelled out immediately alongside. */}
        <BrandLogo brand={brand} sizes="48px" className="h-8 w-8 object-contain" />
      </span>

      {/* Column on a phone so the badge sits under the address rather than
          squeezing the branch name down to two characters. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: brand.accentColor }}
            />
            {brand.name}
          </p>
          <h3 className="font-display mt-0.5 font-medium">{branch.name}</h3>
          {branch.addressLine ? (
            <p className="mt-1 text-sm text-muted">{branch.addressLine}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">{branch.city}</p>
          )}
          {branch.hours && (
            <p className="mt-0.5 text-xs text-muted">{branch.hours}</p>
          )}
          {/*
            This used to read "Illustrative location for this prototype",
            which stopped being true the day the site went live. A visitor
            deciding whether to cross Dar es Salaam needs to know the exact
            address is not published, not that a developer called it a
            prototype.
          */}
          {!branch.addressLine && (
            <p className="mt-2 text-[11px] text-muted/70">
              Exact address not published — confirm with {brand.name} first
            </p>
          )}
        </div>

        <div className="shrink-0">
          <DeliveryBadge deliveryOffered={branch.deliveryOffered} />
        </div>
      </div>
    </Link>
  );
}
