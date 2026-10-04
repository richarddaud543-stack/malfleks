import Link from "next/link";

import { SHOP } from "@/i18n/copy/shop";
import type { Locale } from "@/i18n/locale";

/**
 * What every catalogue surface shows before a single real shop has listed
 * anything.
 *
 * MalFleks launched with an empty catalogue on purpose. The 6 brands, 19 branches,
 * 38 products and 5 couriers that used to be seeded here were **invented** —
 * plausible names, addresses nobody had confirmed and phone numbers that
 * counted upwards from `+255 68 000 0001`. A marketplace that shows a customer
 * a shop which does not exist has not launched early; it has lied. So the
 * catalogue was emptied and it fills up the only way it honestly can: a real
 * business applies, a person at MalFleks checks them, and their products appear.
 *
 * This component is what stands in the gap. It has one job beyond looking
 * unbroken — **an empty grid must not read as a failed page load.** A visitor
 * who thinks the site is broken leaves; a visitor who understands it is new
 * might come back, and might know a shop owner.
 */
export default function EmptyCatalogue({
  /** What this particular page was looking for. */
  looking,
  /** Set on pages where a filter could also explain the emptiness. */
  filtered = false,
  locale = "en",
}: {
  looking: keyof (typeof SHOP)["en"]["empty"]["looking"];
  filtered?: boolean;
  locale?: Locale;
}) {
  const copy = SHOP[locale].empty;

  return (
    <div className="glass-card rounded-2xl px-6 py-14 text-center sm:py-16">
      <p className="font-accent-serif text-lg italic text-accent">{copy.eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-medium tracking-tight sm:text-3xl">
        {copy.heading(copy.looking[looking])}
      </h2>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        {filtered ? copy.filtered : copy.plain}
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">{copy.invite}</p>
      <Link href="/apply" className="btn-pill btn-lime mt-8 inline-block px-6 py-2.5 text-sm">
        {copy.apply}
      </Link>
    </div>
  );
}
