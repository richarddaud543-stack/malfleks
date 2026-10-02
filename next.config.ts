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

const nextConfig: NextConfig = {
  images: {
    // AVIF first, WebP for browsers without it. On mobile data the smaller
    // file is the whole point of routing photos through the optimiser.
    formats: ["image/avif", "image/webp"],
    remotePatterns: productPhotoRemotePatterns(),
  },
  async headers() {
    return [
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
