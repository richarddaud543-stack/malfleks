import { describe, expect, it } from "vitest";

import { resolveOAuthOrigin, resolveSiteUrl } from "./site-url";

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

/**
 * Confirmed live, 2026-09-05: a customer signing in on the public shop was
 * redirected, on return from Google, to the admin console's hostname -- which
 * sits behind Vercel Authentication and is not part of this app at all. The
 * root cause was NEXT_PUBLIC_SITE_URL on the shop project having been set to
 * the admin project's hostname (both projects have at times carried the same
 * variable names -- see claude/malfleks-audit.md). These tests pin the guard
 * that makes that specific misconfiguration harmless from here on.
 */
describe("resolveOAuthOrigin", () => {
  const configuredAdminHost = "malfleks-admin.vercel.app";

  it("sends an admin-host request back to the admin host, ignoring NEXT_PUBLIC_SITE_URL", () => {
    expect(
      resolveOAuthOrigin({
        requestHost: "malfleks-admin.vercel.app",
        configuredSiteUrl: "https://malfleks.vercel.app",
        configuredAdminHost,
      }),
    ).toBe("https://malfleks-admin.vercel.app");
  });

  it("uses the configured site URL for a normal request", () => {
    expect(
      resolveOAuthOrigin({
        requestHost: "malfleks.vercel.app",
        configuredSiteUrl: "https://malfleks.vercel.app",
        configuredAdminHost,
      }),
    ).toBe("https://malfleks.vercel.app");
  });

  // The bug. NEXT_PUBLIC_SITE_URL on the shop project was pointed at the
  // admin host, and the shop trusted it -- sending customers to a login wall
  // for a service they have no account on, and leaving them signed out.
  it("refuses to send a non-admin request to the admin host, even if NEXT_PUBLIC_SITE_URL says to", () => {
    const origin = resolveOAuthOrigin({
      requestHost: "malfleks.vercel.app",
      configuredSiteUrl: "https://malfleks-admin.vercel.app",
      configuredAdminHost,
      forwardedProto: "https",
    });

    expect(origin).not.toContain("malfleks-admin.vercel.app");
    expect(origin).toBe("https://malfleks.vercel.app");
  });

  it("catches the collision through a whole URL, a bare host, or mixed case alike", () => {
    for (const misconfigured of [
      "https://malfleks-admin.vercel.app",
      "malfleks-admin.vercel.app",
      "https://MalFleks-Admin.vercel.app/",
    ]) {
      const origin = resolveOAuthOrigin({
        requestHost: "malfleks.vercel.app",
        configuredSiteUrl: misconfigured,
        configuredAdminHost,
        forwardedProto: "https",
      });
      expect(origin, `misconfigured value ${JSON.stringify(misconfigured)} must be ignored`).toBe(
        "https://malfleks.vercel.app",
      );
    }
  });

  it("falls back to the request host when nothing is configured", () => {
    expect(
      resolveOAuthOrigin({
        requestHost: "malfleks.vercel.app",
        configuredSiteUrl: undefined,
        configuredAdminHost: undefined,
        forwardedProto: "https",
      }),
    ).toBe("https://malfleks.vercel.app");
  });

  it("falls back to localhost over http when there is truly nothing to go on", () => {
    expect(
      resolveOAuthOrigin({
        requestHost: null,
        configuredSiteUrl: undefined,
        configuredAdminHost: undefined,
      }),
    ).toBe("http://localhost:3000");
  });

  it("is unaffected by an unconfigured admin host -- the collision check needs one to compare against", () => {
    expect(
      resolveOAuthOrigin({
        requestHost: "malfleks.vercel.app",
        configuredSiteUrl: "https://malfleks.vercel.app",
        configuredAdminHost: "",
      }),
    ).toBe("https://malfleks.vercel.app");
  });
});
