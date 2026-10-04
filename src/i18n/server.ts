import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { isAdminHost } from "@/lib/admin-host";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locale";

/**
 * Which language the page being drawn on the server is in.
 *
 * Server components cannot read React context, and threading a `locale` prop
 * through sixty components would put it in every signature on the site. So
 * the page says once which language it is (`pageLocale`, from its address),
 * and anything drawn under it asks `getLocale()`.
 *
 * `cache` gives one small box per request (or per page, while building), so
 * two pages being drawn at once never see each other's language.
 *
 * **Every page and layout under `[lang]` must call `pageLocale` first.**
 * A component drawn without it gets English -- which is also what a unit
 * test gets, and why the tests written before the site had two languages
 * still pass unchanged.
 */
const box = cache((): { locale: Locale } => ({ locale: "en" }));

export function setRequestLocale(locale: Locale): void {
  box().locale = locale;
}

export function getLocale(): Locale {
  return box().locale;
}

/**
 * For a page or layout under `[lang]`: reads the language from its address,
 * records it for everything drawn below, and returns it. An address whose
 * first part is not a language (`/nonsense/…`) is a page that does not exist.
 */
export async function pageLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  setRequestLocale(lang);
  return lang;
}

/**
 * For a Server Action or a route handler, which have no address to read: the
 * language the visitor chose, from their cookie.
 */
export async function chosenLocale(): Promise<Locale> {
  // The admin hostname is always English, as in `src/proxy.ts`.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (isAdminHost(host, process.env.MALFLEKS_ADMIN_HOST)) return "en";

  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
