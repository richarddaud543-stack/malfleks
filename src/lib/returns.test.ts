import { describe, expect, it } from "vitest";

import { RETURN_WINDOW_DAYS, returnWindowClosesAt, returnWindowOpen } from "./returns";

const DELIVERED = new Date("2026-10-01T15:00:00Z");
const DAY = 24 * 60 * 60_000;

describe("the 7-day right to return (Electronic Transactions Act s.30)", () => {
  it("is seven days", () => {
    expect(RETURN_WINDOW_DAYS).toBe(7);
  });

  it("is open from delivery until seven whole days after it, and not a minute less", () => {
    expect(returnWindowOpen(DELIVERED, DELIVERED.getTime())).toBe(true);
    expect(returnWindowOpen(DELIVERED, DELIVERED.getTime() + 7 * DAY)).toBe(true);
    expect(returnWindowOpen(DELIVERED, DELIVERED.getTime() + 7 * DAY + 1)).toBe(false);
  });

  it("accepts the ISO string the account page carries", () => {
    expect(returnWindowOpen(DELIVERED.toISOString(), DELIVERED.getTime() + DAY)).toBe(true);
  });

  it("is closed for an order with no delivery time, or a nonsense one", () => {
    expect(returnWindowOpen(null)).toBe(false);
    expect(returnWindowOpen(undefined)).toBe(false);
    expect(returnWindowOpen("not a date")).toBe(false);
  });

  it("is not open before the delivery happened (a clock running behind)", () => {
    expect(returnWindowOpen(DELIVERED, DELIVERED.getTime() - 1)).toBe(false);
  });

  it("says when it closes", () => {
    expect(returnWindowClosesAt(DELIVERED).toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });
});
