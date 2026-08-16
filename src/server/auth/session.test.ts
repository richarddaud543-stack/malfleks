// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  MAX_AUTH_AGE_MS,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  isAuthTimeStale,
  sessionCookieOptions,
} from "./session";

describe("isAuthTimeStale", () => {
  const now = Date.parse("2026-08-16T10:00:00.000Z");
  // Firebase reports auth_time in SECONDS. Getting that unit wrong is the
  // failure this whole describe block exists to prevent: treating it as
  // milliseconds makes every real sign-in look 56 years old, and every
  // sign-in would be refused with a message about taking too long.
  const seconds = (iso: string) => Date.parse(iso) / 1000;

  it("accepts a sign-in that just happened", () => {
    expect(isAuthTimeStale(seconds("2026-08-16T09:59:30.000Z"), now)).toBe(false);
  });

  it("accepts one at the edge of the window", () => {
    expect(isAuthTimeStale(seconds("2026-08-16T09:55:01.000Z"), now)).toBe(false);
  });

  it("rejects one past the window", () => {
    expect(isAuthTimeStale(seconds("2026-08-16T09:50:00.000Z"), now)).toBe(true);
  });

  it("rejects a sign-in claiming to be from the future", () => {
    // Clock skew, or a forged claim. Neither should buy a five-day session.
    expect(isAuthTimeStale(seconds("2026-08-16T10:30:00.000Z"), now)).toBe(true);
  });

  it("tolerates small skew in either direction", () => {
    expect(isAuthTimeStale(seconds("2026-08-16T10:00:30.000Z"), now)).toBe(false);
  });

  it("treats a seconds value read as milliseconds as stale", () => {
    // The regression guard: if someone "fixes" the unit by removing the *1000,
    // a fresh sign-in reads as epoch-adjacent and this flips.
    const wrongUnit = now; // milliseconds passed where seconds are expected
    expect(isAuthTimeStale(wrongUnit, now)).toBe(true);
  });

  it("uses a five-minute window", () => {
    expect(MAX_AUTH_AGE_MS).toBe(5 * 60 * 1000);
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, so page JavaScript can never read the session", () => {
    expect(sessionCookieOptions().httpOnly).toBe(true);
  });

  it("is Secure in production and not on localhost", () => {
    // A Secure cookie on plain-HTTP localhost is silently never stored, which
    // looks exactly like a broken sign-in.
    expect(sessionCookieOptions(SESSION_MAX_AGE_MS, true).secure).toBe(true);
    expect(sessionCookieOptions(SESSION_MAX_AGE_MS, false).secure).toBe(false);
  });

  it("is SameSite=Lax and root-scoped", () => {
    const options = sessionCookieOptions();
    // Lax withholds the cookie from cross-site POSTs (the CSRF case) while
    // still sending it when someone follows a shared link in.
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("expresses maxAge in seconds, as the header requires", () => {
    expect(sessionCookieOptions(5 * 24 * 60 * 60 * 1000).maxAge).toBe(432000);
  });

  it("stays inside Firebase's 14-day ceiling for a session cookie", () => {
    expect(SESSION_MAX_AGE_MS).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);
    expect(SESSION_MAX_AGE_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it("names the cookie something that cannot collide with Firebase's own", () => {
    expect(SESSION_COOKIE_NAME).toBe("soko_session");
  });
});
