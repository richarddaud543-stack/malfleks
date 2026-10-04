/**
 * The two languages MalFleks is written in, and the rules for choosing one.
 *
 * ## How a page ends up in a language
 *
 * Every public page exists twice, at `/sw/…` and `/en/…` (the `[lang]` folder
 * in `src/app`). People do not type those: they use the plain address
 * (`/search`), and `src/proxy.ts` quietly serves the version for the language
 * they chose. The choice is one cookie, set by the switch in the bar at the
 * top of every page. With no cookie, the site is in Swahili -- the owner's
 * call on 4 Oct 2026, because that is the language most of its buyers read
 * first.
 *
 * Both versions of every page are built ahead of time, so choosing a language
 * costs nothing in speed.
 *
 * The admin console is not part of this. It is one person's tool and stays in
 * English.
 */
export type Locale = "en" | "sw";

export const LOCALES: readonly Locale[] = ["sw", "en"];

/** What a visitor who has never chosen sees. */
export const DEFAULT_LOCALE: Locale = "sw";

/** The cookie that remembers the choice. Not private, not signed: it is a preference. */
export const LOCALE_COOKIE = "mf_lang";

/** A year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "sw";
}

/** The other language, for the switch. */
export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "sw" : "en";
}

/**
 * Splits an address into its language and the rest.
 * `/sw/search` → `{ locale: "sw", path: "/search" }`; `/search` → `{ locale: null, path: "/search" }`.
 */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = /^\/(en|sw)(\/.*)?$/.exec(pathname);
  if (!match) return { locale: null, path: pathname || "/" };
  return { locale: match[1] as Locale, path: match[2] || "/" };
}

/** The address of a page in one language: `localePath("en", "/search")` → `/en/search`. */
export function localePath(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * What a page tells search engines about its two versions: which address is
 * its own, and where the same page is in the other language. `path` is the
 * plain address (`/search`).
 *
 * A page that sets `alternates` replaces the root layout's, so the canonical
 * address is given here too. "x-default" -- for a reader whose language is
 * neither -- is the Swahili page, the same one a new visitor gets.
 */
export function localeAlternates(locale: Locale, path: string) {
  return {
    canonical: localePath(locale, path),
    languages: {
      sw: localePath("sw", path),
      en: localePath("en", path),
      "x-default": localePath(DEFAULT_LOCALE, path),
    },
  };
}

/** Open Graph's name for each language. */
export const OG_LOCALE: Record<Locale, string> = { en: "en_GB", sw: "sw_TZ" };

/** Picks one language's words out of a pair. */
export function pick<T>(pair: { en: T; sw: T }, locale: Locale): T {
  return pair[locale];
}
