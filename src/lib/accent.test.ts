import { describe, expect, it } from "vitest";
import { brands } from "@/data";
import { chipColor, contrastRatio, iconAccent } from "./accent";

/** Ratio of a candidate icon colour against the chip a given accent produces. */
function ratioOnChip(iconHex: string, accent: string): number {
  const int = parseInt(iconHex.slice(1), 16);
  const icon: [number, number, number] = [
    (int >> 16) & 255,
    (int >> 8) & 255,
    int & 255,
  ];
  return contrastRatio(icon, chipColor(accent)!);
}

describe("contrastRatio", () => {
  it("is 21:1 for black against white", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it("is 1:1 for a colour against itself", () => {
    expect(contrastRatio([12, 34, 56], [12, 34, 56])).toBeCloseTo(1, 5);
  });
});

describe("iconAccent", () => {
  it("leaves an accent that already passes untouched", () => {
    // Oraimo is 7.5:1 on its own chip — nothing to correct.
    expect(iconAccent("#0BC5A0")).toBe("#0BC5A0");
  });

  it("lightens Apple's near-black accent, which fails at 1.12:1 raw", () => {
    expect(ratioOnChip("#1D1D1F", "#1D1D1F")).toBeLessThan(1.2);

    const corrected = iconAccent("#1D1D1F");
    expect(corrected).not.toBe("#1D1D1F");
    expect(ratioOnChip(corrected, "#1D1D1F")).toBeGreaterThanOrEqual(3);
  });

  it("lightens Ford's dark navy, which fails at 1.56:1 raw", () => {
    expect(ratioOnChip("#003478", "#003478")).toBeLessThan(1.6);
    expect(ratioOnChip(iconAccent("#003478"), "#003478")).toBeGreaterThanOrEqual(3);
  });

  it("returns unparseable input unchanged rather than inventing a colour", () => {
    expect(iconAccent("not-a-colour")).toBe("not-a-colour");
  });

  it("gives every brand in the catalogue an icon that clears 3:1", () => {
    for (const brand of brands) {
      const ratio = ratioOnChip(iconAccent(brand.accentColor), brand.accentColor);
      expect(
        ratio,
        `${brand.name} (${brand.accentColor}) renders its icon at ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
