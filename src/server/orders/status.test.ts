import { describe, expect, it } from "vitest";
import { canTransition } from "./status";

/**
 * `canTransition` exists precisely so the transition table is testable
 * without a database, the same reasoning `review.test.ts` gives for
 * `canApprove`. Every allowed edge and a representative sample of every
 * disallowed one, including both terminal states and an order caught mid-way
 * through a status this codebase has never written.
 */

describe("canTransition", () => {
  it("blocks a missing order regardless of target", () => {
    expect(canTransition(null, "confirmed")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(canTransition(null, "cancelled")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(canTransition(null, "fulfilled")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  describe("from pending", () => {
    it("allows confirming", () => {
      expect(canTransition({ status: "pending" }, "confirmed")).toEqual({
        ok: true,
      });
    });

    it("allows cancelling", () => {
      expect(canTransition({ status: "pending" }, "cancelled")).toEqual({
        ok: true,
      });
    });

    it("blocks jumping straight to fulfilled", () => {
      expect(canTransition({ status: "pending" }, "fulfilled")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
    });
  });

  describe("from confirmed", () => {
    it("allows marking fulfilled", () => {
      expect(canTransition({ status: "confirmed" }, "fulfilled")).toEqual({
        ok: true,
      });
    });

    it("allows cancelling", () => {
      expect(canTransition({ status: "confirmed" }, "cancelled")).toEqual({
        ok: true,
      });
    });

    it("blocks confirming again", () => {
      expect(canTransition({ status: "confirmed" }, "confirmed")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
    });
  });

  describe("from fulfilled — terminal", () => {
    it("blocks every target, including re-fulfilling", () => {
      expect(canTransition({ status: "fulfilled" }, "confirmed")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
      expect(canTransition({ status: "fulfilled" }, "cancelled")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
      expect(canTransition({ status: "fulfilled" }, "fulfilled")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
    });
  });

  describe("from cancelled — terminal", () => {
    it("blocks every target, including re-cancelling", () => {
      expect(canTransition({ status: "cancelled" }, "confirmed")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
      expect(canTransition({ status: "cancelled" }, "cancelled")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
      expect(canTransition({ status: "cancelled" }, "fulfilled")).toEqual({
        ok: false,
        reason: "invalid-transition",
      });
    });
  });

  it("treats an unrecognised status as having no valid targets, not as a crash", () => {
    // The type is a bare `string`, matching the schema comment ("text, not
    // enums"). A row this codebase never wrote — or a status from before this
    // vocabulary existed — must be treated as immovable rather than silently
    // allowed through, the same defensive stance `canApprove` takes for
    // "any non-pending status".
    expect(canTransition({ status: "withdrawn" }, "confirmed")).toEqual({
      ok: false,
      reason: "invalid-transition",
    });
  });
});
