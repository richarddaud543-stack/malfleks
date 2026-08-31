import { describe, it, expect } from "vitest";
import { describeBranchLocation, formatEta, formatTZS } from "./format";
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

/**
 * The sentence two product pages print when an order is blocked, telling the
 * customer where to go instead.
 *
 * It used to be built inline as `{name} is at {addressLine}, open {hours}`.
 * Both fields became optional on 2026-08-31 when the invented addresses and
 * opening hours were removed, and that template degrades into
 * "Toyota Tanzania — Arusha is at , open ." — which reads as a broken page
 * rather than as a fact we do not have.
 */
describe("describeBranchLocation", () => {
  it("uses the street address and hours when both are known", () => {
    expect(
      describeBranchLocation({
        name: "iStore Tanzania — Mikocheni",
        city: "Dar es Salaam",
        addressLine: "194 Chato Street, Mikocheni, Dar es Salaam",
        hours: "Mon–Sat 09:00–18:00",
      })
    ).toBe(
      "iStore Tanzania — Mikocheni is at 194 Chato Street, Mikocheni, Dar es Salaam, open Mon–Sat 09:00–18:00"
    );
  });

  // The case the helper exists for.
  it("falls back to the city when there is no confirmed address", () => {
    expect(
      describeBranchLocation({ name: "Toyota Tanzania — Arusha", city: "Arusha" })
    ).toBe("Toyota Tanzania — Arusha is in Arusha");
  });

  it("drops the hours clause rather than leaving it empty", () => {
    const sentence = describeBranchLocation({
      name: "CMC Ford — Dodoma",
      city: "Dodoma",
    });
    expect(sentence).not.toMatch(/open\s*$/);
    expect(sentence).not.toContain(", open");
  });

  it("never produces a dangling preposition or empty clause", () => {
    for (const branch of [
      { name: "A", city: "Dar es Salaam" },
      { name: "B", city: "Mwanza", addressLine: "1 Test Road" },
      { name: "C", city: "Dodoma", hours: "Mon–Fri" },
    ]) {
      const sentence = describeBranchLocation(branch);
      expect(sentence, sentence).not.toMatch(/is at ,|is at $|open $|, ,/);
      expect(sentence).toContain(branch.name);
    }
  });
});
