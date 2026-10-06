import { describe, expect, it } from "vitest";

import {
  afterWrongAttempt,
  deliveryCodeState,
  deliveryCodesMatch,
  generateDeliveryCode,
  normaliseDeliveryCode,
  PAUSE_MINUTES,
  WRONG_BEFORE_LOCK,
  WRONG_BEFORE_PAUSE,
} from "./delivery-code";

describe("generateDeliveryCode", () => {
  it("is always six digits, including when it starts with zero", () => {
    for (let i = 0; i < 2_000; i += 1) {
      expect(generateDeliveryCode()).toMatch(/^\d{6}$/);
    }
  });

  it("does not hand everyone the same code", () => {
    const codes = new Set(Array.from({ length: 200 }, generateDeliveryCode));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe("normaliseDeliveryCode", () => {
  it("accepts the code however it was read aloud and typed", () => {
    expect(normaliseDeliveryCode("482913")).toBe("482913");
    expect(normaliseDeliveryCode(" 482 913 ")).toBe("482913");
    expect(normaliseDeliveryCode("482-913")).toBe("482913");
    expect(normaliseDeliveryCode("48.29.13")).toBe("482913");
  });

  it("keeps a leading zero", () => {
    expect(normaliseDeliveryCode("012345")).toBe("012345");
  });

  it.each(["", "48291", "4829134", "48291a", "abcdef", "482913; x"])("refuses %j", (raw) => {
    expect(normaliseDeliveryCode(raw)).toBeNull();
  });

  it.each([null, undefined, 482913, {}, ["482913"]])("refuses a value that is not text: %j", (raw) => {
    expect(normaliseDeliveryCode(raw)).toBeNull();
  });
});

describe("deliveryCodesMatch", () => {
  it("matches only the exact code", () => {
    expect(deliveryCodesMatch("482913", "482913")).toBe(true);
    expect(deliveryCodesMatch("482913", "482914")).toBe(false);
    expect(deliveryCodesMatch("482913", "48291")).toBe(false);
    expect(deliveryCodesMatch("482913", "")).toBe(false);
  });
});

describe("afterWrongAttempt", () => {
  const now = new Date("2026-10-05T10:00:00Z");

  it("counts down the tries before a pause", () => {
    expect(afterWrongAttempt(1, now)).toEqual({ lockedUntil: null, adminOnly: false, triesLeft: 4 });
    expect(afterWrongAttempt(4, now)).toEqual({ lockedUntil: null, adminOnly: false, triesLeft: 1 });
  });

  it("pauses entry for a quarter of an hour on every fifth wrong code", () => {
    for (const wrong of [WRONG_BEFORE_PAUSE, WRONG_BEFORE_PAUSE * 2]) {
      const next = afterWrongAttempt(wrong, now);
      expect(next.adminOnly).toBe(false);
      expect(next.triesLeft).toBe(0);
      expect(next.lockedUntil?.getTime()).toBe(now.getTime() + PAUSE_MINUTES * 60_000);
    }
  });

  it("starts a fresh five after a pause", () => {
    expect(afterWrongAttempt(6, now).triesLeft).toBe(4);
  });

  it("hands the order to an admin at the limit, and stays there", () => {
    expect(afterWrongAttempt(WRONG_BEFORE_LOCK, now)).toEqual({ lockedUntil: null, adminOnly: true, triesLeft: 0 });
    expect(afterWrongAttempt(WRONG_BEFORE_LOCK + 3, now).adminOnly).toBe(true);
  });
});

describe("deliveryCodeState", () => {
  const now = new Date("2026-10-05T10:00:00Z");

  it("is all clear for an order with no code row yet", () => {
    expect(deliveryCodeState(null, now)).toEqual({ lockedUntil: null, adminOnly: false, problemReported: false });
  });

  it("reports a pause only while it is still running", () => {
    const later = new Date(now.getTime() + 60_000);
    const earlier = new Date(now.getTime() - 60_000);
    expect(deliveryCodeState({ wrongAttempts: 5, lockedUntil: later, problemAt: null }, now).lockedUntil).toBe(later.toISOString());
    expect(deliveryCodeState({ wrongAttempts: 5, lockedUntil: earlier, problemAt: null }, now).lockedUntil).toBeNull();
  });

  it("never carries the code itself", () => {
    const state = deliveryCodeState({ wrongAttempts: WRONG_BEFORE_LOCK, lockedUntil: null, problemAt: now }, now);
    expect(state).toEqual({ lockedUntil: null, adminOnly: true, problemReported: true });
    expect(Object.keys(state)).not.toContain("code");
  });
});
