import type { NextConfig } from "next";

/**
 * The one remote place product photos may be optimised from: this project's
 * own `product-photos` Storage bucket, and nothing else on that host.
 *
 * The hostname comes from `NEXT_PUBLIC_SUPABASE_URL`, which Next has already
 * loaded into `process.env` by the time it evaluates this file — the same
 * variable the browser bundle and `supabaseAuthConfig()` read, so there is
 * one definition of "our Supabase project" rather than a hostname typed here
 * that could drift from it.
 *
 * **Missing or unparseable means no pattern at all**, not a wildcard. The
 * image optimiser is an open proxy for whatever it is allowed to fetch, so
 * the safe failure is "optimises nothing remote". `ProductPhoto` makes the
 * matching decision on its side (`canOptimizeProductPhoto`) and draws photos
 * unoptimised in that case, so a build or a test run without the variable
 * still shows them — it just does not resize them.
 *
 * The pathname must stay in step with `PRODUCT_PHOTO_PUBLIC_PATH` in
 * `src/lib/product-photo.ts`. It is repeated rather than imported because
 * this file is loaded before the `@/` path alias exists.
 */
function productPhotoRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    return [
      {
        protocol: url.protocol === "https:" ? "https" : "http",
        hostname: url.hostname,
        port: url.port,
        pathname: "/storage/v1/object/public/product-photos/**",
        // No query string: a public object URL never has one, and allowing
        // any would let the same photo be requested under endless cache keys.
        search: "",
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Headers every response carries.
 *
 * Before 4 Oct 2026 the site sent one browser-safety header (HSTS, added by
 * the host). These are the rest of the standard set -- the OWASP baseline --
 * and each is here for a reason that applies to this site:
 *
 * - `X-Content-Type-Options: nosniff` -- a file is only ever treated as the
 *   type it is served as. Matters for a site that accepts photo uploads.
 * - `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` -- no other site
 *   may show MalFleks inside a frame, which is how a customer is tricked into
 *   pressing "Pay" or "Cancel" on a page they cannot see (clickjacking). The
 *   payment itself is a redirect to ClickPesa, not a frame, so nothing of
 *   ours needs framing.
 * - `Referrer-Policy: strict-origin-when-cross-origin` -- a link out of the
 *   site tells the other site only that the visitor came from MalFleks, never
 *   which page (a pay or track address carries an order reference).
 * - `Permissions-Policy` -- the page may ask for location, which a courier
 *   uses to report where a delivery is, and nothing else: no camera, no
 *   microphone, no payment-request API. Photos are picked through an ordinary
 *   file input, which this does not affect.
 * - CSP `base-uri 'self'` and `object-src 'none'` -- two old injection routes
 *   closed outright, at no cost.
 *
 * **What is deliberately not here: a script policy.** A Content-Security-
 * Policy that restricts scripts needs a per-request nonce threaded through
 * every page, and has to be proved against the things that cannot be tested
 * without real accounts -- Google sign-in, the photo upload to Supabase, the
 * redirect to ClickPesa. Getting it wrong breaks ordering silently. It is the
 * next step, and it wants a staging run first.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // "X-Powered-By: Next.js" tells an attacker which framework to look up and
  // tells nobody else anything.
  poweredByHeader: false,
  images: {
    // AVIF first, WebP for browsers without it. On mobile data the smaller
    // file is the whole point of routing photos through the optimiser.
    formats: ["image/avif", "image/webp"],
    remotePatterns: productPhotoRemotePatterns(),
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/sign-in",
        headers: [
          {
            // Opener isolation for the sign-in page.
            //
            // This was `same-origin-allow-popups` when sign-in opened a Google
            // popup: the relaxed form was needed to keep our own handle on the
            // window we opened. Supabase's OAuth flow is a top-level redirect,
            // so there is no popup and no handle to preserve, and the strict
            // form is now simply correct — a cross-origin page that opens
            // /sign-in keeps no `window.opener` reference into it at all.
            //
            // Also gone with the popup: the browser's "Cross-Origin-Opener-
            // Policy policy would block the window.closed call" console error,
            // which came from Firebase polling `popup.closed` against a Google
            // document that sends `COOP: same-origin` itself. It was noise
            // rather than a failure, it was upstream, and it is no longer
            // reachable.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
