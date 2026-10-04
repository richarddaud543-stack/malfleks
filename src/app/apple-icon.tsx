import { ImageResponse } from "next/og";

import { IconMark, shareFonts } from "@/lib/share-image";

/** What an iPhone shows when the site is added to the home screen. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<IconMark size={180} rounded={false} />, { ...size, fonts: await shareFonts() });
}
