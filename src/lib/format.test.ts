import { describe, it, expect } from "vitest";
import { formatTZS } from "./format";

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
