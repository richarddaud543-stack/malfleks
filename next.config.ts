import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Only the sign-in page, which is the only page that opens a popup.
        source: "/sign-in",
        headers: [
          {
            // Opener isolation for the one page that opens a window. This puts
            // /sign-in in its own browsing-context group, so a cross-origin
            // page that opens *us* keeps no `window.opener` handle into this
            // document, while `allow-popups` preserves our own handle on the
            // Google popup we opened.
            //
            // What this does NOT do, tested rather than assumed: it does not
            // silence the browser's "Cross-Origin-Opener-Policy policy would
            // block the window.closed call" console error during sign-in. That
            // comes from `accounts.google.com` sending `COOP: same-origin`
            // itself, which severs the opener relationship from Google's side —
            // nothing set here can override a header on their document. Firebase
            // polls `popup.closed` to notice a cancelled sign-in, so the message
            // appears once per poll. It is noise, not a failure: cancellation is
            // still detected and reported to the customer. It is upstream and
            // not ours to fix — see docs/auth.md.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
