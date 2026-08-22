import { describe, expect, it } from "vitest";
import { brands } from "@/data";
import {
  borderAccent,
  chipColor,
  contrastRatio,
  iconAccent,
  pageGround,
  selectedChipColor,
} from "./accent";

function toRgb(hex: string): [number, number, number] {
  const int = parseInt(hex.slice(1), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Ratio of a candidate icon colour against the chip a given accent produces. */
function ratioOnChip(iconHex: string, accent: string): number {
  return contrastRatio(toRgb(iconHex), chipColor(accent)!);
}

/** A border has two neighbours; both have to clear the bar. */
function borderRatios(borderHex: string, accent: string) {
  const border = toRgb(borderHex);
  return {
    onPage: contrastRatio(border, pageGround),
    onFill: contrastRatio(border, selectedChipColor(accent)!),
  };
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

describe("borderAccent — the selected brand filter chip", () => {
  it("leaves accents that already clear both neighbours untouched", () => {
    // Toyota, Ford, BMW and Apple all pass raw; correcting them would be
    // damage to brand identity for no accessibility gain.
    expect(borderAccent("#EB0A1E")).toBe("#EB0A1E");
    expect(borderAccent("#003478")).toBe("#003478");
    expect(borderAccent("#0066B1")).toBe("#0066B1");
    expect(borderAccent("#1D1D1F")).toBe("#1D1D1F");
  });

  it("darkens Oraimo, which fails against the page at 2.21:1", () => {
    expect(borderRatios("#0BC5A0", "#0BC5A0").onPage).toBeLessThan(3);

    const corrected = borderAccent("#0BC5A0");
    expect(corrected).not.toBe("#0BC5A0");

    const { onPage, onFill } = borderRatios(corrected, "#0BC5A0");
    expect(onPage).toBeGreaterThanOrEqual(3);
    expect(onFill).toBeGreaterThanOrEqual(3);
  });

  it("corrects Halotel, which passes on the page but fails on its own fill", () => {
    // The regression this guards: Halotel is 3.19:1 against the white page and
    // 2.75:1 against the tint inside the chip. An implementation that checked
    // only the page — the obvious one to write — returns it unchanged and the
    // border still vanishes along its inner edge. Both grounds, or neither.
    const raw = borderRatios("#00A651", "#00A651");
    expect(raw.onPage).toBeGreaterThanOrEqual(3);
    expect(raw.onFill).toBeLessThan(3);

    const { onPage, onFill } = borderRatios(borderAccent("#00A651"), "#00A651");
    expect(onPage).toBeGreaterThanOrEqual(3);
    expect(onFill).toBeGreaterThanOrEqual(3);
  });

  it("makes the smallest change that clears the bar", () => {
    // Halotel needs a few percent, not a drag to near-black.
    const { onFill } = borderRatios(borderAccent("#00A651"), "#00A651");
    expect(onFill).toBeLessThan(4);
  });

  it("returns unparseable input unchanged rather than inventing a colour", () => {
    expect(borderAccent("not-a-colour")).toBe("not-a-colour");
  });

  it("gives every brand a selected-chip border that clears 3:1 on both sides", () => {
    for (const brand of brands) {
      const { onPage, onFill } = borderRatios(
        borderAccent(brand.accentColor),
        brand.accentColor
      );
      expect(
        Math.min(onPage, onFill),
        `${brand.name} (${brand.accentColor}) draws its selected border at ` +
          `${onPage.toFixed(2)}:1 on the page and ${onFill.toFixed(2)}:1 on the fill`
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
