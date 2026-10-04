import type { MetadataRoute } from "next";

import { LOCALES } from "@/i18n/locale";
import { resolveSiteUrl } from "@/lib/site-url";

const siteUrl = resolveSiteUrl();

/** One person's own pages. They exist at the plain address and once per language. */
const PRIVATE_PAGES = ["/account", "/partner", "/pay/", "/track/", "/order/"];

/**
 * Everyone may read the shop, search engines and AI assistants alike -- being
 * found and quoted is the point of the public pages.
 *
 * The disallowed paths are one person's own pages or have nothing in them for
 * a visitor who is not signed in. Each already answers a crawler with a
 * redirect to sign-in and carries `noindex`; listing them here just saves the
 * crawler the trip. Nothing depends on this file for privacy: the pages check
 * the session themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        ...PRIVATE_PAGES,
        ...LOCALES.flatMap((locale) => PRIVATE_PAGES.map((path) => `/${locale}${path}`)),
        "/admin",
        "/api/",
        "/auth/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
