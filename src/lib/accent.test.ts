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

describe("iconAccent on the light theme", () => {
  it("leaves a dark accent untouched — those pass on a white-based chip", () => {
    // Apple and Ford were the failures on the old near-black ground. On white
    // they are the safest colours in the catalogue, so correcting them would be
    // damage, not a fix.
    expect(iconAccent("#1D1D1F")).toBe("#1D1D1F");
    expect(iconAccent("#003478")).toBe("#003478");
  });

  it("darkens a bright accent that vanishes on a white chip", () => {
    // Oraimo raw: ~2.04:1 against its own chip.
    expect(ratioOnChip("#0BC5A0", "#0BC5A0")).toBeLessThan(3);

    const corrected = iconAccent("#0BC5A0");
    expect(corrected).not.toBe("#0BC5A0");
    expect(ratioOnChip(corrected, "#0BC5A0")).toBeGreaterThanOrEqual(3);
  });

  it("corrects by darkening, not lightening, on a light ground", () => {
    // The bug this guards: Oraimo cannot reach 3:1 by lightening at all — even
    // pure white against its chip tops out around 2.2:1 — so a function that
    // only lightens returns something that still fails.
    const corrected = iconAccent("#0BC5A0");
    const int = parseInt(corrected.slice(1), 16);
    const sum = ((int >> 16) & 255) + ((int >> 8) & 255) + (int & 255);
    const rawSum = 0x0b + 0xc5 + 0xa0;
    expect(sum).toBeLessThan(rawSum);
  });

  it("makes the smallest change that clears the bar", () => {
    // Halotel needs only a few percent; it should not be dragged to near-black.
    const corrected = iconAccent("#00A651");
    expect(ratioOnChip(corrected, "#00A651")).toBeGreaterThanOrEqual(3);
    expect(ratioOnChip(corrected, "#00A651")).toBeLessThan(4);
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
