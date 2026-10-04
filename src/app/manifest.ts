import type { MetadataRoute } from "next";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-identity";

/**
 * What a phone uses when someone adds MalFleks to their home screen: the
 * name under the icon, the icon itself, and the colours of the splash.
 *
 * `display: "browser"` on purpose. MalFleks is a website and does not work
 * offline; "standalone" would hide the address bar and the back button and
 * promise an app that is not there.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#0c1e18",
    lang: "en",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
