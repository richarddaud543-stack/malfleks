/**
 * Brand accent colours are identity, not UI tokens.
 *
 * A brand hands us one hex value and we use it everywhere — glows, dots, tints,
 * and as the fill of the product icon. That last one is the problem: the icon
 * sits on a chip tinted with the *same* colour, so a dark accent draws a dark
 * shape on a dark ground. Apple's `#1D1D1F` lands at 1.12:1 and Ford's
 * `#003478` at 1.56:1, against the 3:1 WCAG 1.4.11 asks of non-text UI.
 *
 * So the accent is kept for everything decorative, and only the *foreground*
 * use is corrected — lightened toward white by the smallest amount that clears
 * the threshold, so a brand whose colour already works is returned untouched.
 */

/** `--surface`, the card ground the icon chip is drawn on. */
const SURFACE: RGB = [0x0e, 0x10, 0x16];

/** The chip is `${accent}18` — hex alpha 0x18, i.e. 24/255. */
const CHIP_ALPHA = 0x18 / 255;

/** WCAG 1.4.11: non-text UI needs 3:1. */
const MIN_RATIO = 3;

type RGB = [number, number, number];

function parseHex(hex: string): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex([r, g, b]: RGB): string {
  const channel = (c: number) =>
    Math.round(Math.min(255, Math.max(0, c)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** src-over: `fg` at `alpha` composited onto opaque `bg`. */
function composite(fg: RGB, alpha: number, bg: RGB): RGB {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as RGB;
}

function mixWithWhite(color: RGB, amount: number): RGB {
  return color.map((c) => c + (255 - c) * amount) as RGB;
}

/**
 * The colour to fill a product icon with, given its brand accent.
 *
 * Returns the accent unchanged when it already clears 3:1 against its own
 * tinted chip; otherwise the least-lightened variant that does. Unparseable
 * input is returned as given — a malformed colour is a data bug to fix in
 * `src/data/brands.ts`, not something to paper over with a default here.
 */
export function iconAccent(accent: string): string {
  const rgb = parseHex(accent);
  if (!rgb) return accent;

  // The chip is tinted with the original accent, so the ground stays fixed
  // while the foreground moves.
  const chip = composite(rgb, CHIP_ALPHA, SURFACE);
  if (contrastRatio(rgb, chip) >= MIN_RATIO) return accent;

  // 2% steps: fine enough that a corrected colour still reads as the brand's,
  // coarse enough to terminate quickly. White always clears the bar, so this
  // cannot fall through without a result.
  for (let amount = 0.02; amount <= 1; amount += 0.02) {
    const lightened = mixWithWhite(rgb, amount);
    if (contrastRatio(lightened, chip) >= MIN_RATIO) return toHex(lightened);
  }
  return "#ffffff";
}

/** Exposed for tests: the chip colour a given accent produces. */
export function chipColor(accent: string): RGB | null {
  const rgb = parseHex(accent);
  return rgb ? composite(rgb, CHIP_ALPHA, SURFACE) : null;
}
