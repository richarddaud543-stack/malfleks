import { describe, expect, it } from "vitest";

import { isAuthConfigured, supabaseAuthConfig } from "./config";

/**
 * These read like trivia until you notice what they protect: **the site is
 * supposed to work with no auth configuration at all.** The catalogue, search,
 * the locator and the whole order flow are open to signed-out visitors by
 * design, so a missing key must cost `/account` and `/admin` and nothing else.
 *
 * Every one of these functions therefore has to answer "no" rather than throw,
 * and it has to answer "no" for a blank string as readily as for an absent one
 * — because a `.env` line someone left as `NEXT_PUBLIC_SUPABASE_URL=""` and a
 * Vercel field someone created but never filled both arrive as `""`, and both
 * are far more likely in practice than the variable being genuinely absent.
 */

const URL = "https://nnrcjeowivnbzdkwxxrm.supabase.co";
const KEY = "sb_publishable_example";

describe("supabaseAuthConfig", () => {
  it("returns both values when both are set", () => {
    expect(
      supabaseAuthConfig({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY,
      }),
    ).toEqual({ url: URL, anonKey: KEY });
  });

  it("returns null when either half is missing", () => {
    expect(supabaseAuthConfig({ NEXT_PUBLIC_SUPABASE_URL: URL })).toBeNull();
    expect(supabaseAuthConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY })).toBeNull();
    expect(supabaseAuthConfig({})).toBeNull();
  });

  // Half-configured is the state that would actually reach production, and it
  // must read as "not configured" rather than as a client that fails later,
  // deeper, with a worse message.
  it("treats an empty or whitespace-only value as absent", () => {
    for (const blank of ["", "   ", "\n", "\t"]) {
      expect(
        supabaseAuthConfig({
          NEXT_PUBLIC_SUPABASE_URL: blank,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY,
        }),
        `url ${JSON.stringify(blank)} must not count as configured`,
      ).toBeNull();

      expect(
        supabaseAuthConfig({
          NEXT_PUBLIC_SUPABASE_URL: URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: blank,
        }),
        `key ${JSON.stringify(blank)} must not count as configured`,
      ).toBeNull();
    }
  });

  it("trims surrounding whitespace rather than passing it on", () => {
    expect(
      supabaseAuthConfig({
        NEXT_PUBLIC_SUPABASE_URL: `  ${URL}  `,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: `\n${KEY}\n`,
      }),
    ).toEqual({ url: URL, anonKey: KEY });
  });

  it("accepts the legacy anon JWT as readily as a publishable key", () => {
    // Supabase issues both forms and `@supabase/ssr` takes either. Nothing here
    // should be parsing or validating the key's shape — that is the auth
    // server's job, and a format check here would be a future outage.
    const legacy = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
    expect(
      supabaseAuthConfig({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: legacy,
      }),
    ).toEqual({ url: URL, anonKey: legacy });
  });
});

describe("isAuthConfigured", () => {
  it("agrees with supabaseAuthConfig in both directions", () => {
    expect(
      isAuthConfigured({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY,
      }),
    ).toBe(true);
    expect(isAuthConfigured({})).toBe(false);
    expect(
      isAuthConfigured({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toBe(false);
  });
});
