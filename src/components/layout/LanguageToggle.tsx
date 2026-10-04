"use client";

import { useLocale } from "@/i18n/client";
import { CHROME } from "@/i18n/copy/chrome";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, splitLocale, type Locale } from "@/i18n/locale";

/**
 * Remembers the choice and loads the same page again in it.
 *
 * A full load on purpose, not a soft navigation: the browser keeps pages it
 * has already fetched, and those are in the old language.
 */
function switchLanguage(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  // On `/en/search` the plain address is `/search`: go there, and the cookie
  // decides the language.
  const { path } = splitLocale(window.location.pathname);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above: a full load is the point
  window.location.assign(`${path}${window.location.search}${window.location.hash}`);
}

/**
 * The switch that puts the whole site in Swahili or in English.
 *
 * Two buttons, the current one pressed. Choosing the other writes the choice
 * to a cookie and loads the same page again -- a full load, not a soft one,
 * so nothing the browser has kept in the old language is shown by mistake.
 * From then on every page comes in that language (`src/proxy.ts`).
 *
 * Each button is named in its own language and marked as such, so a Swahili
 * reader on the English site finds the word they are looking for.
 */
export default function LanguageToggle({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const copy = CHROME[locale].language;

  function choose(next: Locale) {
    if (next !== locale) switchLanguage(next);
  }

  return (
    <div
      role="group"
      aria-label={copy.group}
      data-testid="language-toggle"
      className={`inline-flex shrink-0 items-center rounded-full border border-border p-0.5 ${className}`}
    >
      {LOCALES.map((option) => {
        const current = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={current}
            aria-label={copy.names[option]}
            title={copy.names[option]}
            onClick={() => choose(option)}
            className={`min-h-9 min-w-9 rounded-full px-2.5 text-xs font-semibold tracking-wide transition-colors ${
              current ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {copy.short[option]}
          </button>
        );
      })}
    </div>
  );
}
