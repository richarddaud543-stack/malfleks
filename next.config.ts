import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
