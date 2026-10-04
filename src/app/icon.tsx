import { ImageResponse } from "next/og";

import { IconMark, shareFonts } from "@/lib/share-image";

/**
 * The browser-tab icon, in the three sizes browsers and Android ask for.
 * `manifest.ts` points at the two larger ones.
 */
export const contentType = "image/png";

const SIZES = [48, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((px) => ({ id: String(px), size: { width: px, height: px }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const requested = Number(await id);
  const px = (SIZES as readonly number[]).includes(requested) ? requested : 48;
  return new ImageResponse(<IconMark size={px} />, { width: px, height: px, fonts: await shareFonts() });
}
