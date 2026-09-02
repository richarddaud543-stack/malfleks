import { NextResponse, type NextRequest } from "next/server";

import { isAdminHost } from "@/lib/admin-host";

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
 * ## Why `process.env.SOKO_ADMIN_HOST` is read literally here
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
  if (!isAdminHost(host, process.env.SOKO_ADMIN_HOST)) {
    return NextResponse.next();
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
  const response = NextResponse.next();
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Everything except Next's own immutable assets. The admin console is not
  // hot enough for the cost of this to matter, and a narrow matcher is how the
  // header quietly stops covering a route somebody adds later.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
