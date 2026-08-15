import Image from "next/image";
import Link from "next/link";
import { getBranchesByBrandId } from "@/data";
import type { Brand, Branch } from "@/data";

export interface DeliveryMixSummary {
  text: string;
  tone: "positive" | "caution";
}

/**
 * Summarises how a brand's branches deliver, e.g. "2 of 3 branches deliver
 * directly". Always derived from live branch data — never hardcoded — so it
 * stays correct as branches are added, removed or flip `deliveryOffered`.
 *
 * Tone reuses DeliveryBadge's binary colour semantics rather than inventing a
 * third: "positive" (emerald) only when direct delivery is guaranteed no
 * matter which branch fulfils the order; "caution" (amber) whenever it isn't
 * — none, or only some, of the branches deliver directly.
 *
 * Wording is special-cased, not templated, so no count reads oddly:
 * - No branches at all: no summary to show (returns null).
 * - Exactly one branch: never says "1 of 1 branches" — just states the fact.
 * - Every branch delivers / no branch delivers: states it plainly, no tally.
 * - A genuine mix: the "X of Y" tally, where the count is the useful part.
 */
export function summarizeDeliveryMix(
  branches: Branch[]
): DeliveryMixSummary | null {
  const total = branches.length;
  if (total === 0) return null;

  const delivering = branches.filter((b) => b.deliveryOffered).length;

  if (total === 1) {
    return delivering === 1
      ? { text: "Delivers directly", tone: "positive" }
      : { text: "Local courier delivery", tone: "caution" };
  }

  if (delivering === total) {
    return {
      text: `Delivers directly at all ${total} branches`,
      tone: "positive",
    };
  }

  if (delivering === 0) {
    return { text: "No branches deliver directly", tone: "caution" };
  }

  return {
    text: `${delivering} of ${total} branches deliver directly`,
    tone: "caution",
  };
}

export default function BrandCard({ brand }: { brand: Brand }) {
  const deliveryMix = summarizeDeliveryMix(getBranchesByBrandId(brand.id));

  return (
    <Link
      href={`/brands/${brand.slug}`}
      className="group glass-card tint-glow relative block overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-white/25"
      style={{ "--tint": brand.accentColor } as React.CSSProperties}
    >
      <div
        className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50"
        style={{ background: brand.accentColor }}
      />
      <div className="relative h-16 w-16 rounded-xl bg-white p-3 shadow-lg">
        <Image
          src={brand.logo}
          alt={brand.name}
          fill
          sizes="64px"
          className="object-contain p-3"
        />
      </div>
      <h3 className="relative mt-4 font-display text-lg font-medium">
        {brand.name}
      </h3>
      <p className="relative mt-1 text-xs uppercase tracking-wide text-muted">
        {brand.category}
      </p>
      {deliveryMix && (
        <span
          className={`relative mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            deliveryMix.tone === "positive"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              deliveryMix.tone === "positive" ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          {deliveryMix.text}
        </span>
      )}
      <p className="relative mt-3 line-clamp-2 text-sm text-muted">
        {brand.description}
      </p>
    </Link>
  );
}
