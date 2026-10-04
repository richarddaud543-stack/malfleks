import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  localePath,
  splitLocale,
  type Locale,
} from "@/i18n/locale";
import { isAdminHost } from "@/lib/admin-host";

/**
 * Addresses that are not pages written in a language: the admin console, the
 * API, the sign-in callback, and the files a browser or crawler asks for by
 * name. Everything else is a shop page and exists once per language.
 */
const NOT_A_LANGUAGE_PAGE = /^\/(admin|api|auth|_next|_vercel|icon|apple-icon|opengraph-image|\.well-known)(\/|$)|^\/(manifest\.webmanifest|robots\.txt|sitemap\.xml)$|\.[a-z0-9]{2,5}$/i;

/**
 * Serves a shop page in the visitor's language.
 *
 * The pages live at `/sw/…` and `/en/…`. A visitor asks for `/search`; this
 * answers with `/sw/search` or `/en/search` without changing the address they
 * see. Which one is their cookie's say, and Swahili when they have never
 * chosen. `forced` is for the admin hostname, whose few shop pages (sign-in)
 * are always English.
 *
 * An address that already names its language (`/en/search`, from a search
 * engine or a shared link) is served as asked.
 *
 * Returns nothing for an address that is not a language page.
 */
function inLanguage(request: NextRequest, forced?: Locale): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (NOT_A_LANGUAGE_PAGE.test(pathname)) return null;

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const { locale: named } = splitLocale(pathname);

  // Served as asked. Nothing is remembered here: see `RememberLandingLanguage`
  // for why that is the browser's job and not this file's.
  if (named) return NextResponse.next();

  const locale = forced ?? (isLocale(cookie) ? cookie : DEFAULT_LOCALE);
  const url = request.nextUrl.clone();
  url.pathname = localePath(locale, pathname);
  return NextResponse.rewrite(url);
}

/**
 * What makes the admin hostname feel like its own site.
 *
 * **This is not the security boundary and must never become one.** Whether a
 * given person may read the review queue is decided by `requireAdmin()` in the
 * DAL and `adminSession()` in the actions — next to the data, where a matcher
 * edit here cannot quietly stop covering it. Everything in this file is
 * presentation: where `/` lands, what crawlers are told, what the tab says.
 *
 * `proxy.ts`, not `middleware.ts`: Next.js 16 renamed the convention. The
 * behaviour is identical, and the old name is deprecated rather than removed —
 * but a project that keeps the old name gets a deprecation warning on every
 * build, and this file was written after the rename.
 *
 * ## Why `process.env.MALFLEKS_ADMIN_HOST` is read literally here
 *
 * This runs in the Edge runtime, where Next inlines environment reads by
 * finding the literal text `process.env.NAME` at build time. Reading it through
 * a helper that takes an `env` object would inline to nothing, and the proxy
 * would decide — silently, and only in production — that no admin host is
 * configured. So the read is literal and the comparison is a pure function.
 *
 * One consequence to know: changing this variable on Vercel needs a redeploy to
 * take effect *here*. The server-side gate in `server/auth/host.ts` reads a
 * live `process.env` and takes effect immediately, which is the half that
 * matters if you ever need to move the console in a hurry.
 */
export function proxy(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  // No separate admin site configured, or this is the public one: hands off.
  // The public site's behaviour is unchanged by this file existing.
  // On the shop, the one thing this file does is choose the language.
  if (!isAdminHost(host, process.env.MALFLEKS_ADMIN_HOST)) {
    return inLanguage(request) ?? NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // The app's own robots.txt says "allow everything", which is right for the
  // shop and wrong here. Served from the proxy rather than a second static
  // file so the two can never drift out of agreement about which host is which.
  if (pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  // A sitemap listing every brand and product page belongs to the shop. Here it
  // would be a map of the catalogue served from the back-office hostname.
  if (pathname === "/sitemap.xml") {
    return new NextResponse(null, { status: 404 });
  }

  // The front door. Opening the admin hostname should land on the console, not
  // on the marketplace home page — that is the whole difference between "a
  // second address for the same site" and "my own site".
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Belt and braces on top of the per-page `robots` metadata: a header covers
  // every response on this host, including ones nobody thought to annotate.
  // The admin hostname's few shop pages (sign-in) are always in English.
  const response = inLanguage(request, "en") ?? NextResponse.next();
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Everything except Next's own immutable assets. The admin console is not
  // hot enough for the cost of this to matter, and a narrow matcher is how the
  // header quietly stops covering a route somebody adds later.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
