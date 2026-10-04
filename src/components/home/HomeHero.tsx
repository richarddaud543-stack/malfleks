import Link from "next/link";

import type { Locale } from "@/i18n/locale";
import { SITE_COPY } from "@/lib/site-copy";
import MoneyPath from "./MoneyPath";

/**
 * The first screen of the site: the promise, in the owner's agreed words, and
 * the picture of how it works.
 *
 * It replaced a dark, animated opening whose headline was "A shop window for
 * the whole city" -- a description of a directory, on a site whose reason to
 * exist had become "your money is held until your order arrives". The promise
 * was the second thing on the page; it is now the first, on every screen
 * size, with no script needed to show it.
 *
 * One heading, one line in the other language, one sentence, two buttons.
 * Everything else on the page is below it. The words come from
 * `site-copy.ts`, in English or in Swahili.
 */
export default function HomeHero({ locale = "en" }: { locale?: Locale }) {
  const { hero } = SITE_COPY[locale];

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 sm:pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pb-24">
      <div>
        {/* The last word carries the accent face, as it does on the share picture. */}
        <h1 className="font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight sm:text-6xl">
          {hero.headline} <span className="font-accent-serif italic text-accent">{hero.headlineAccent}</span>
        </h1>
        <p lang={hero.secondLineLang} className="mt-4 font-display text-xl text-accent sm:text-2xl">
          {hero.secondLine}
        </p>
        <p className="mt-5 max-w-xl text-lg text-muted">{hero.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/search" className="btn-pill btn-lime px-7 py-3 text-base">
            {hero.search}
          </Link>
          <Link href="/how-it-works" className="btn-pill btn-outline px-7 py-3 text-base">
            {hero.howItWorks}
          </Link>
        </div>
      </div>

      <MoneyPath locale={locale} />
    </section>
  );
}
