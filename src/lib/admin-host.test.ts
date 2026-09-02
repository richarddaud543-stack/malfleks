import { describe, expect, it } from "vitest";

import {
  adminHost,
  adminRoutesAllowedOn,
  isAdminHost,
  normalizeHost,
} from "./admin-host";

/**
 * The rule that decides whether the admin console exists on a given hostname.
 *
 * Two things are worth holding tightly here, and they pull in opposite
 * directions:
 *
 * 1. When a host *is* configured, nothing that merely resembles it gets in —
 *    not a subdomain of it, not a lookalike with the name as a prefix, not a
 *    `Host` header carrying a port that was never configured.
 * 2. When one is *not* configured, everything gets in, because failing closed
 *    would lock the owner out of the console he administers.
 */

describe("normalizeHost", () => {
  it("treats blank, whitespace and absent as the same thing", () => {
    // The `""` trap: a Vercel field created before the domain was known.
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost("   ")).toBeNull();
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });

  it("folds case, because DNS does", () => {
    expect(normalizeHost("Soko-Admin.Vercel.App")).toBe("soko-admin.vercel.app");
  });

  it("accepts a whole URL, because that is what people paste", () => {
    expect(normalizeHost("https://soko-admin.vercel.app/admin")).toBe(
      "soko-admin.vercel.app"
    );
  });

  it("drops the default ports and a fully-qualified trailing dot", () => {
    expect(normalizeHost("soko-admin.vercel.app:443")).toBe("soko-admin.vercel.app");
    expect(normalizeHost("soko-admin.vercel.app:80")).toBe("soko-admin.vercel.app");
    expect(normalizeHost("soko-admin.vercel.app.")).toBe("soko-admin.vercel.app");
  });

  it("keeps a non-default port, because two dev servers are two hosts", () => {
    expect(normalizeHost("localhost:3000")).toBe("localhost:3000");
    expect(normalizeHost("localhost:3000")).not.toBe(normalizeHost("localhost:3001"));
  });
});

describe("adminHost", () => {
  it("is null when nothing is configured", () => {
    expect(adminHost("")).toBeNull();
    expect(adminHost(undefined)).toBeNull();
  });

  it("normalizes whatever was configured", () => {
    expect(adminHost(" https://Admin.Soko.example/ ")).toBe("admin.soko.example");
  });
});

describe("isAdminHost", () => {
  const configured = "soko-admin.vercel.app";

  it("matches the configured host exactly", () => {
    expect(isAdminHost("soko-admin.vercel.app", configured)).toBe(true);
    expect(isAdminHost("SOKO-ADMIN.vercel.app:443", configured)).toBe(true);
  });

  it("rejects the public site", () => {
    expect(isAdminHost("soko.vercel.app", configured)).toBe(false);
  });

  // The mistakes an attacker makes on purpose. A prefix or suffix match here
  // would hand the console to anyone who can register a domain.
  it("rejects lookalikes rather than matching loosely", () => {
    expect(isAdminHost("soko-admin.vercel.app.evil.example", configured)).toBe(false);
    expect(isAdminHost("evil-soko-admin.vercel.app", configured)).toBe(false);
    expect(isAdminHost("x.soko-admin.vercel.app", configured)).toBe(false);
    expect(isAdminHost("soko-admin.vercel.app:8443", configured)).toBe(false);
  });

  it("rejects a missing Host header instead of treating it as a match", () => {
    expect(isAdminHost(null, configured)).toBe(false);
    expect(isAdminHost("", configured)).toBe(false);
  });

  it("is false when no admin host is configured, whatever the request says", () => {
    // This is what keeps the root redirect and the noindex header from firing
    // on a deployment that never asked for a separate admin site.
    expect(isAdminHost("soko-admin.vercel.app", "")).toBe(false);
    expect(isAdminHost("anything.example", undefined)).toBe(false);
  });
});

describe("adminRoutesAllowedOn", () => {
  it("allows every host when none is configured", () => {
    // Local development, CI, preview deployments, and production before the
    // domain exists. Failing closed here would lock the owner out.
    expect(adminRoutesAllowedOn("localhost:3000", "")).toBe(true);
    expect(adminRoutesAllowedOn("soko.vercel.app", undefined)).toBe(true);
    expect(adminRoutesAllowedOn(null, "   ")).toBe(true);
  });

  it("allows only the configured host once one is set", () => {
    expect(adminRoutesAllowedOn("soko-admin.vercel.app", "soko-admin.vercel.app")).toBe(true);
    expect(adminRoutesAllowedOn("soko.vercel.app", "soko-admin.vercel.app")).toBe(false);
    expect(adminRoutesAllowedOn(null, "soko-admin.vercel.app")).toBe(false);
  });
});
