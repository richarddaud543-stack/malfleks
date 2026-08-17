import { describe, it, expect } from "vitest";
import { formatEta, formatTZS } from "./format";
import { deliveryAgents } from "@/data";

// Intl.NumberFormat inserts a non-breaking space between symbol and amount —
// normalize to a plain space so the assertion isn't coupled to that detail.
const normalizeSpaces = (s: string) => s.replace(/\s/g, " ");

describe("formatTZS", () => {
  it("formats a large amount with thousands separators and a TZS symbol", () => {
    expect(normalizeSpaces(formatTZS(68_000_000))).toBe("TSh 68,000,000");
  });

  it("formats a small amount", () => {
    expect(normalizeSpaces(formatTZS(2000))).toBe("TSh 2,000");
  });

  it("rounds to whole shillings (no decimals)", () => {
    expect(formatTZS(1000.6)).not.toContain(".");
  });
});

describe("formatEta", () => {
  it("calls a 0–0 quote same-day", () => {
    expect(formatEta({ minDays: 0, maxDays: 0 })).toBe("Same-day");
  });

  it("calls a 1–1 quote next day rather than '1 day'", () => {
    expect(formatEta({ minDays: 1, maxDays: 1 })).toBe("Next day");
  });

  it("renders a multi-day range with an en dash", () => {
    expect(formatEta({ minDays: 1, maxDays: 2 })).toBe("1–2 days");
  });

  it("renders a single figure above one day in days", () => {
    expect(formatEta({ minDays: 3, maxDays: 3 })).toBe("3 days");
  });

  it("does not promise same-day for a range that merely starts today", () => {
    const label = formatEta({ minDays: 0, maxDays: 2 });
    expect(label).not.toBe("Same-day");
    expect(label).toBe("Today – 2 days");
  });

  it("produces a non-empty label for every seeded courier", () => {
    for (const agent of deliveryAgents) {
      expect(formatEta(agent.eta).trim().length).toBeGreaterThan(0);
    }
  });
});
