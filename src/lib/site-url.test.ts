import { describe, expect, it } from "vitest";

import { resolveSiteUrl } from "./site-url";

/**
 * These exist because the empty-string case is not hypothetical: it broke the
 * first Vercel deployment of this site.
 *
 * `metadataBase: new URL(siteUrl)` runs at module evaluation during
 * `next build`. When `siteUrl` is `""`, `new URL("")` throws
 * `ERR_INVALID_URL`, the build reports "Failed to collect page data for
 * /_not-found", and nothing in that message mentions an environment variable.
 * The whole cost of that failure is paid by the two-line difference between
 * `??` and a trimmed truthiness check.
 */

describe("resolveSiteUrl", () => {
  it("returns a configured origin", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://malfleks.example" })).toBe(
      "https://malfleks.example",
    );
  });

  // The case that broke production. `??` would return "" here.
  it("falls back when the variable is present but empty", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "" })).toBe("http://localhost:3000");
  });

  it("falls back for whitespace-only values", () => {
    for (const blank of ["   ", "\n", "\t", " \n "]) {
      expect(
        resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: blank }),
        `${JSON.stringify(blank)} must not count as configured`,
      ).toBe("http://localhost:3000");
    }
  });

  it("falls back when the variable is absent", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });

  it("trims surrounding whitespace rather than passing it into new URL", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "  https://malfleks.example  " })).toBe(
      "https://malfleks.example",
    );
  });

  // robots.ts and sitemap.ts both build paths as `${siteUrl}/...`, so a
  // trailing slash here becomes `//sitemap.xml` on a live robots.txt.
  it("strips trailing slashes so callers can append a path", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://malfleks.example/" })).toBe(
      "https://malfleks.example",
    );
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://malfleks.example///" })).toBe(
      "https://malfleks.example",
    );
  });

  it("produces something new URL always accepts", () => {
    for (const value of [undefined, "", "   ", "https://malfleks.example/"]) {
      expect(() => new URL(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: value }))).not.toThrow();
    }
  });
});
