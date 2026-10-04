import type { Metadata } from "next";

import { SITE_NAME, SITE_SHARE_ALT } from "./site-identity";

/**
 * What a page turns into when its link is pasted into a chat: a headline, a
 * line of text and a picture.
 *
 * A helper because of one trap. A page that sets `openGraph` in its metadata
 * replaces everything the root layout set there -- including the picture. So
 * a page that only wanted its own headline ("oraimo — Dodoma") silently lost
 * its preview image, which is what the brand, branch and photo-less product
 * pages did until 4 Oct 2026. Every page that wants its own headline goes
 * through here, and gets the site's picture unless it brings a better one.
 *
 * `path` is the page's own address on the public site ("/brands/oraimo").
 * `image` is an absolute URL to a real photo, when the page has one.
 */
export function sharePreview({
  title,
  description,
  path,
  image,
  locale = "en_GB",
}: {
  title: string;
  description: string;
  path: string;
  image?: { url: string; alt: string };
  /** Open Graph's language tag for the page; the Swahili pages pass "sw_TZ". */
  locale?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const picture = image ?? { url: "/opengraph-image", alt: SITE_SHARE_ALT, width: 1200, height: 630 };
  return {
    openGraph: { type: "website", siteName: SITE_NAME, locale, url: path, title, description, images: [picture] },
    twitter: { card: "summary_large_image", title, description, images: [picture.url] },
  };
}
