"use client";

import { useEffect } from "react";

import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, splitLocale } from "@/i18n/locale";

/** Looked at once per page load, not once per page. */
let looked = false;

/**
 * Keeps a visitor in the language of the page they arrived on.
 *
 * Someone who follows a search result to `/en/search` and has never chosen a
 * language should stay in English when they open the next page -- but every
 * link on the site is a plain address (`/brands`), which means "the language
 * you chose, or Swahili". So the first page of a visit, if its address names
 * a language and no choice is on record, records that language as the choice.
 *
 * Only the first page, and only here in the browser:
 *
 * - **Not on later pages.** The Swahili legal pages link to their English
 *   text. Reading one page in English is not choosing English.
 * - **Not in the proxy.** It was there first, and it broke exactly that: the
 *   browser fetches linked pages ahead of time, the fetch of `/en/terms`
 *   passed through the proxy, and a Swahili reader who had only *looked at* a
 *   page with that link on it found the whole site in English.
 */
export default function RememberLandingLanguage() {
  useEffect(() => {
    if (looked) return;
    looked = true;

    const { locale } = splitLocale(window.location.pathname);
    if (!locale) return;

    const chosen = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
      ?.slice(LOCALE_COOKIE.length + 1);
    if (isLocale(chosen)) return;

    rememberLanguage(locale);
  }, []);

  return null;
}

function rememberLanguage(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}
