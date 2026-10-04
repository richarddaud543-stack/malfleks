import Link from "next/link";

import { CHROME } from "@/i18n/copy/chrome";
import type { Locale } from "@/i18n/locale";
import { PROMISE } from "@/lib/promise";

export default function Footer({ locale = "en" }: { locale?: Locale }) {
  const copy = CHROME[locale].footer;

  return (
    <footer data-site-chrome="" className="mx-auto mt-24 max-w-6xl px-3 pb-6 sm:px-6">
      <div className="panel px-6 py-12 sm:px-10 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-medium">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-lime" />
              MalFleks<span className="text-accent">.</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              {copy.blurb}
              {/* The promise in the other language, as on the home page. */}
              <span lang={locale === "en" ? "sw" : "en"} className="mt-1 block">
                {locale === "en" ? PROMISE.swahili : `${PROMISE.headline}.`}
              </span>
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">{copy.explore}</h2>
            <ul className="mt-2 text-sm text-muted">
              <li><Link href="/search" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.searchProducts}</Link></li>
              <li><Link href="/brands" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.allBrands}</Link></li>
              <li><Link href="/agents" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.agents}</Link></li>
              <li><Link href="/locator" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.locator}</Link></li>
              <li><Link href="/apply" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.apply}</Link></li>
            </ul>
          </div>

          {/*
            This column listed "Automotive / Electronics / Telecom" as plain
            text until 2026-09-01 — three categories that were never links and
            that described the seeded placeholder catalogue rather than
            anything a visitor could reach. With the catalogue emptied they
            described nothing at all. Categories now come from what partners
            actually list, so the space goes to the pages every site owes its
            visitors and this one did not have.
          */}
          <div>
            <h2 className="text-sm font-semibold text-foreground">MalFleks</h2>
            <ul className="mt-2 text-sm text-muted">
              <li><Link href="/account" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.yourOrders}</Link></li>
              <li><Link href="/how-it-works" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.howItWorks}</Link></li>
              <li><Link href="/terms#paying" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.paying}</Link></li>
              <li><Link href="/contact" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.contact}</Link></li>
              <li><Link href="/terms" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.terms}</Link></li>
              <li><Link href="/privacy" className="inline-flex min-h-9 items-center transition-colors hover:text-foreground">{copy.privacy}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-foreground/10 pt-6 text-xs text-muted">
          {/*
            This said "Prototype build" until 2026-08-31, on a site the public
            could already reach. The trademark sentence is the part that
            matters and it stays; the word prototype was telling visitors the
            wrong thing about whether this is real.
          */}
          {copy.legal}
        </div>
      </div>
    </footer>
  );
}
