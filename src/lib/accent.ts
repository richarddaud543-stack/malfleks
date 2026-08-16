/**
 * Brand accent colours are identity, not UI tokens.
 *
 * A brand hands us one hex value and we use it everywhere — glows, dots, tints,
 * and as the fill of the product icon. That last one is the problem: the icon
 * sits on a chip tinted with the *same* colour, so the accent is always drawn
 * against a near-copy of itself.
 *
 * Which colours fail depends entirely on the page ground, and the ground
 * changed. On the old near-black theme the dark accents disappeared — Apple
 * `#1D1D1F` at 1.12:1, Ford `#003478` at 1.56:1 — so this file lightened them.
 * On the light theme the failures invert: the chip is now white-based, and it
 * is the bright accents that vanish — Oraimo `#0BC5A0` at 2.04:1, Halotel
 * `#00A651` at 2.87:1. Lightening those makes them worse.
 *
 * So the correction is no longer directional by assumption. It searches
 * outward from the accent in both directions and takes the first result that
 * clears the bar, which keeps the colour as close to the brand's own as the
 * contrast requirement allows — and keeps working if the ground changes again.
 */

/** `--surface-2`: the card fill the icon chip is painted onto. */
const CHIP_GROUND: RGB = [0xff, 0xff, 0xff];

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

/** Moves `color` a fraction of the way toward `target`. */
function mix(color: RGB, target: RGB, amount: number): RGB {
  return color.map((c, i) => c + (target[i] - c) * amount) as RGB;
}

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

/**
 * The colour to fill a product icon with, given its brand accent.
 *
 * Returns the accent unchanged when it already clears 3:1 against its own
 * tinted chip; otherwise the nearest variant that does, darker or lighter.
 * Unparseable input is returned as given — a malformed colour is a data bug to
 * fix in `src/data/brands.ts`, not something to paper over with a default.
 */
export function iconAccent(accent: string): string {
  const rgb = parseHex(accent);
  if (!rgb) return accent;

  // The chip is tinted with the original accent, so the ground stays fixed
  // while the foreground moves.
  const chip = composite(rgb, CHIP_ALPHA, CHIP_GROUND);
  if (contrastRatio(rgb, chip) >= MIN_RATIO) return accent;

  // Step outward in 2% increments, testing both directions at each step, so the
  // result is the smallest change that works rather than a fixed direction.
  // Some accents cannot pass by lightening at all — Oraimo tops out at 2.21:1
  // even at pure white — which is exactly why this is not hardcoded to one way.
  for (let amount = 0.02; amount <= 1; amount += 0.02) {
    for (const target of [BLACK, WHITE]) {
      const candidate = mix(rgb, target, amount);
      if (contrastRatio(candidate, chip) >= MIN_RATIO) return toHex(candidate);
    }
  }

  // Unreachable in practice: black or white clears 3:1 against any chip this
  // produces. Kept so the function is total rather than falling through.
  return contrastRatio(BLACK, chip) >= contrastRatio(WHITE, chip)
    ? "#000000"
    : "#ffffff";
}

/** Exposed for tests: the chip colour a given accent produces. */
export function chipColor(accent: string): RGB | null {
  const rgb = parseHex(accent);
  return rgb ? composite(rgb, CHIP_ALPHA, CHIP_GROUND) : null;
}
