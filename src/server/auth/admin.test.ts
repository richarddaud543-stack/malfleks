import { describe, expect, it } from "vitest";
import { adminEmailAllowlist, hasAdminClaim, isAdminUser } from "./admin";
import type { Session } from "./dal";

/**
 * The one question this file answers: **who gets into `/admin`.**
 *
 * Tested in both directions on purpose. A gate suite that only proves admins
 * get in is half a suite — the half that matters is that everyone else does
 * not, and the way to know these assertions work is that each of them fails
 * when the rule is loosened.
 */

function session(overrides: Partial<Session> = {}): Session {
  return {
    uid: "uid-1",
    name: "Asha Mwenda",
    email: "asha@example.com",
    emailVerified: true,
    picture: null,
    admin: false,
    ...overrides,
  };
}

describe("adminEmailAllowlist", () => {
  it("is empty when the variable is unset — nobody is admin by default", () => {
    expect(adminEmailAllowlist({})).toEqual([]);
    expect(adminEmailAllowlist({ SOKO_ADMIN_EMAILS: "" })).toEqual([]);
  });

  it("splits, trims and lowercases", () => {
    expect(
      adminEmailAllowlist({ SOKO_ADMIN_EMAILS: " Owner@Soko.co.tz , b@x.com " })
    ).toEqual(["owner@soko.co.tz", "b@x.com"]);
  });

  it("ignores empty entries from a trailing comma", () => {
    expect(adminEmailAllowlist({ SOKO_ADMIN_EMAILS: "a@x.com,," })).toEqual([
      "a@x.com",
    ]);
  });
});

// `hasAdminClaim` is exported and documented as the pure claim check, but
// nothing in `src/server` currently calls it — `dal.ts` inlines
// `decoded.admin === true` when building the session, and `isAdminUser` reads
// `session.admin` directly rather than calling this function. Tested anyway,
// because it is public API this module promises a caller: whatever reads a
// raw claims bag (a decoded ID token has the same `admin` field name as a
// decoded session cookie) needs the boolean-narrowing behaviour verified, not
// assumed from the fact that it currently has no caller.
describe("hasAdminClaim", () => {
  it("is true only for the literal boolean true", () => {
    expect(hasAdminClaim({ admin: true })).toBe(true);
  });

  it("rejects truthy non-boolean values a token could plausibly carry", () => {
    // Custom claims are just JSON; nothing stops a value of "true", 1, or
    // similar from arriving on the wire. A `== true` check would admit all of
    // these; `=== true` must not.
    for (const admin of ["true", 1, "1", {}, [], "yes"]) {
      expect(hasAdminClaim({ admin }), `admin: ${JSON.stringify(admin)} must not pass`).toBe(
        false
      );
    }
  });

  it("rejects a missing claim and an explicit false", () => {
    expect(hasAdminClaim({})).toBe(false);
    expect(hasAdminClaim({ admin: false })).toBe(false);
    expect(hasAdminClaim({ admin: null })).toBe(false);
    expect(hasAdminClaim({ admin: undefined })).toBe(false);
  });
});

describe("isAdminUser — who is let in", () => {
  it("admits a session carrying the custom claim, with no allowlist at all", () => {
    expect(isAdminUser(session({ admin: true }), {})).toBe(true);
  });

  it("admits the claim even with no verified email at all — the claim needs no email check", () => {
    // isAdminUser's claim branch returns before the email/allowlist logic runs
    // at all. Proven here rather than assumed: a session with admin:true but
    // no email and an unverified flag must still get in, and would only fail
    // to if a future edit reordered the checks or added an email requirement
    // to the claim path.
    expect(
      isAdminUser(
        session({ admin: true, email: null, emailVerified: false }),
        { SOKO_ADMIN_EMAILS: "" }
      )
    ).toBe(true);
  });

  it("admits an allowlisted, verified email", () => {
    expect(
      isAdminUser(session(), { SOKO_ADMIN_EMAILS: "asha@example.com" })
    ).toBe(true);
  });

  it("matches the allowlist case-insensitively", () => {
    expect(
      isAdminUser(session({ email: "Asha@Example.com" }), {
        SOKO_ADMIN_EMAILS: "asha@example.com",
      })
    ).toBe(true);
  });
});

describe("isAdminUser — who is kept out", () => {
  it("refuses a signed-out visitor", () => {
    expect(isAdminUser(null, { SOKO_ADMIN_EMAILS: "asha@example.com" })).toBe(
      false
    );
  });

  it("refuses an ordinary signed-in customer", () => {
    expect(isAdminUser(session(), {})).toBe(false);
  });

  it("refuses an email that is on the list but unverified", () => {
    // The allowlist trusts a string rather than a signed assertion about a uid,
    // so it insists the provider vouched for the address. The claim path does
    // not need this, which is why the two branches differ.
    expect(
      isAdminUser(session({ emailVerified: false }), {
        SOKO_ADMIN_EMAILS: "asha@example.com",
      })
    ).toBe(false);
  });

  it("refuses a session with no email when the allowlist is the only route", () => {
    expect(
      isAdminUser(session({ email: null }), {
        SOKO_ADMIN_EMAILS: "asha@example.com",
      })
    ).toBe(false);
  });

  it("does not match a substring or a lookalike domain", () => {
    // Guards the naive `includes()` on the joined string that this could have
    // been written as: "asha@example.com.attacker.tld" contains the real
    // address, and an allowlist that matched it would be worthless.
    for (const email of [
      "asha@example.com.attacker.tld",
      "notasha@example.com",
      "asha@example.co",
    ]) {
      expect(
        isAdminUser(session({ email }), {
          SOKO_ADMIN_EMAILS: "asha@example.com",
        }),
        `${email} must not be treated as admin`
      ).toBe(false);
    }
  });

  it("refuses everyone when the allowlist is unset and no claim is present", () => {
    expect(isAdminUser(session({ email: "anyone@anywhere.com" }), {})).toBe(
      false
    );
  });
});
