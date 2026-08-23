import { describe, expect, it } from "vitest";
import { canApprove } from "./review";

/**
 * `canApprove` exists precisely so this rule is testable without a database —
 * `approveApplication` calls the same function after two real queries, but
 * every branch of the *decision* is exercised here with plain objects.
 *
 * Four cases from the assignment, plus the precedence between them: which
 * blocker wins when more than one applies. The order matters because
 * `approveApplication` always evaluates `alreadyPartnered` before calling
 * this — including on applications that are not pending — so a wrong
 * precedence here would surface as the wrong error message to an admin, not
 * as a crash.
 */

describe("canApprove", () => {
  it("blocks a missing application", () => {
    expect(canApprove(null, false)).toEqual({ ok: false, reason: "not-found" });
    // A missing application blocks regardless of the partnered flag — there is
    // no uid to check against, so this must not be reachable through the
    // alreadyPartnered branch instead.
    expect(canApprove(null, true)).toEqual({ ok: false, reason: "not-found" });
  });

  it("blocks an application that has already been decided", () => {
    expect(canApprove({ status: "approved" }, false)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
    expect(canApprove({ status: "rejected" }, false)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });

  it("blocks an already-reviewed application even if the uid is unpartnered", () => {
    // Guards against a flipped condition: "already-reviewed" must not
    // accidentally require alreadyPartnered to also be true.
    expect(canApprove({ status: "approved" }, false)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });

  it("blocks a pending application whose account already manages a partner", () => {
    expect(canApprove({ status: "pending" }, true)).toEqual({
      ok: false,
      reason: "account-already-partnered",
    });
  });

  it("status is checked before the partnered flag — not-found wins over everything", () => {
    // If the precedence were reversed, a caller who passed alreadyPartnered
    // for a null application would get "account-already-partnered" instead of
    // "not-found", which would tell an admin the wrong thing about why the
    // approve button failed.
    expect(canApprove(null, true).ok).toBe(false);
    expect((canApprove(null, true) as { reason: string }).reason).toBe(
      "not-found"
    );
  });

  it("already-reviewed is checked before the partnered flag", () => {
    // A rejected application whose uid happens to have since joined another
    // partner must still report "already-reviewed", the reason that actually
    // explains why this decision cannot be made again.
    expect(canApprove({ status: "rejected" }, true)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });

  it("approves a pending application from an unpartnered account — the happy path", () => {
    expect(canApprove({ status: "pending" }, false)).toEqual({ ok: true });
  });

  it("treats any non-pending status as already-reviewed, not just the two known values", () => {
    // The type is a bare `string`, not a union, matching the schema comment
    // ("text, not enums"). A third status value introduced later must still
    // be treated as decided rather than silently approved.
    expect(canApprove({ status: "withdrawn" }, false)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });
});
