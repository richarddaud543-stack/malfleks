import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * What the pictures MalFleks generates in code have in common: the share
 * preview (`app/opengraph-image.tsx`) and the site icons (`app/icon.tsx`,
 * `app/apple-icon.tsx`).
 *
 * The colours are the site's own, written out because these images are drawn
 * outside the page and cannot read its CSS variables. Keep them in step with
 * `globals.css`: `--foreground`, `--lime`, and the scene palette's lime, mint
 * and muted.
 */
export const MARK = {
  forest: "#0c1e18",
  raised: "#122720",
  hairline: "#2a3f37",
  ink: "#f2f7f4",
  muted: "#9fb3aa",
  mint: "#d4f5e0",
  lime: "#9eb60f",
  brightLime: "#e6ff55",
} as const;

const fontFile = (name: string) => readFile(join(process.cwd(), "src/assets/fonts", name));

/** The two faces the image generator is given. See `src/assets/fonts/README.md`. */
export async function shareFonts() {
  const [display, serif] = await Promise.all([
    fontFile("bricolage-grotesque-latin-600-normal.woff"),
    fontFile("instrument-serif-latin-400-italic.woff"),
  ]);
  return [
    { name: "Bricolage", data: display, weight: 600 as const, style: "normal" as const },
    { name: "Instrument", data: serif, weight: 400 as const, style: "italic" as const },
  ];
}

/**
 * The site icon: an "M" on the forest ground, with the lime dot that follows
 * the name in the site's header.
 *
 * This is the mark the site already wears, drawn small -- not a new logo. It
 * replaced the hosting provider's default triangle, which is what every
 * browser tab and saved bookmark showed until 4 Oct 2026.
 */
export function IconMark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: MARK.forest,
        // Square for a phone's home screen, which rounds the corners itself and
        // paints any transparent corner black.
        borderRadius: rounded ? size * 0.22 : 0,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "Bricolage",
          fontWeight: 600,
          fontSize: size * 0.66,
          lineHeight: 1,
          color: MARK.ink,
          marginTop: -size * 0.04,
          marginLeft: -size * 0.08,
        }}
      >
        M
      </div>
      <div
        style={{
          position: "absolute",
          right: size * 0.13,
          bottom: size * 0.2,
          width: size * 0.15,
          height: size * 0.15,
          borderRadius: size,
          background: MARK.brightLime,
        }}
      />
    </div>
  );
}
