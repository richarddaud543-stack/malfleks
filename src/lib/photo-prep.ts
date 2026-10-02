/**
 * Getting a partner's photo ready to upload — the decisions, not the pixels.
 *
 * Phones here take 4–12 MB photos and most partners are on mobile data, so
 * `ProductPhotoUpload` shrinks every photo in the browser before a single
 * byte is sent. This module is everything about that step that can be decided
 * without a canvas: which files are accepted, how big the result should be,
 * what it is called, and what the partner is told when a photo will not do.
 * The canvas half lives in `photo-prep-browser.ts` and is deliberately thin,
 * because nothing in it can run under a unit test.
 *
 * ## The honesty rule
 *
 * A product photo is evidence of what the buyer will receive. The only things
 * done to one are: turn it the right way up (the orientation the camera
 * recorded), make it smaller, and re-encode it. No cropping, no background
 * removal, no brightening, no sharpening — nothing that changes what the item
 * looks like. If a future change here would make a scratched phone look less
 * scratched, it does not belong in this file.
 */

/**
 * What may be picked. Raised from 5 MB to 15 MB when in-browser shrinking
 * arrived: the file that is *uploaded* is a few hundred kilobytes either way,
 * and a 5 MB cap was turning away the ordinary output of a mid-range phone
 * camera.
 */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Longest side of the uploaded image, in pixels. Never scaled *up* to this. */
export const MAX_LONG_SIDE = 1600;

/**
 * Shortest side a photo must have. Below this the product page's main image
 * is being stretched on an ordinary phone screen, and a blurry photo sells
 * worse than the icon it replaced.
 */
export const MIN_SHORT_SIDE = 500;

export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.85;

const STANDARD_TYPES = ["image/jpeg", "image/png", "image/webp"];
const HEIC_TYPES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];

/**
 * The `accept` attribute for the file input. The extensions are listed as
 * well as the types because several Android file pickers report an iPhone
 * photo with an empty type, and would grey it out on type alone.
 */
export const PHOTO_INPUT_ACCEPT = [...STANDARD_TYPES, "image/heic", "image/heif", ".heic", ".heif"].join(",");

export const PHOTO_MESSAGES = {
  wrongType: "Use a photo — JPEG, PNG, WEBP or an iPhone photo (HEIC).",
  tooBig: "That photo is over 15 MB. Take it again at a lower quality setting, or send a smaller one.",
  tooSmall: "This photo is too small to show clearly — use one at least 500 pixels wide.",
  unreadable: "We couldn't open that photo. Try a different one.",
  heicUnsupported:
    "This browser can't open iPhone photos in HEIC format. In your phone's camera settings choose \"Most Compatible\", or send the photo as a JPEG, and add it again.",
  uploadFailed: "The upload didn't go through. Check your connection and try again.",
  unavailable: "Photo upload isn't available right now.",
  signedOut: "Your session expired. Sign in again and retry.",
  tooMany: "A listing can have up to 6 photos — the extra ones were left out.",
} as const;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Whether a picked file is an iPhone-style HEIC/HEIF photo. By type, or by
 * extension when the picker reported no type at all.
 */
export function isHeicFile(file: { type: string; name: string }): boolean {
  if (HEIC_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = extensionOf(file.name);
  return file.type === "" && (ext === "heic" || ext === "heif");
}

/**
 * The checks that need only the file's own description — run before anything
 * is decoded, so a 40 MB video is refused without being read into memory.
 * Returns the sentence to show, or `null` when the file may go on to be
 * decoded.
 */
export function checkPhotoFile(file: { type: string; size: number; name: string }): string | null {
  const known = STANDARD_TYPES.includes(file.type.toLowerCase()) || isHeicFile(file);
  if (!known) return PHOTO_MESSAGES.wrongType;
  if (file.size > MAX_INPUT_BYTES) return PHOTO_MESSAGES.tooBig;
  return null;
}

/**
 * The check that needs the decoded size. Measured on the *shortest* side so
 * a 4000×300 banner does not pass on the strength of its width.
 */
export function checkPhotoDimensions(width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0)) return PHOTO_MESSAGES.unreadable;
  return Math.min(width, height) < MIN_SHORT_SIDE ? PHOTO_MESSAGES.tooSmall : null;
}

/**
 * The size to draw at: the longest side at most `MAX_LONG_SIDE`, the shape
 * unchanged. A photo already inside the limit keeps its own size — scaling up
 * invents pixels, and inventing pixels is not something this step does.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxLongSide: number = MAX_LONG_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxLongSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxLongSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface PhotoOutputFormat {
  contentType: "image/webp" | "image/jpeg";
  extension: "webp" | "jpg";
}

/**
 * What the encoder actually produced, from the type of the blob it handed
 * back.
 *
 * A browser that cannot encode WebP does not fail when asked to — it quietly
 * returns a PNG instead, which for a photograph is several times larger than
 * the original. So the caller asks for WebP, looks at what came back with
 * `encodedAsWebp`, and asks again for JPEG if it was not WebP.
 */
export function encodedAsWebp(blobType: string): boolean {
  return blobType.toLowerCase() === "image/webp";
}

export function outputFormatFor(blobType: string): PhotoOutputFormat {
  return encodedAsWebp(blobType)
    ? { contentType: "image/webp", extension: "webp" }
    : { contentType: "image/jpeg", extension: "jpg" };
}

/**
 * Where a photo goes in the bucket: `<uid>/<id>.<ext>`.
 *
 * The first segment is the signed-in partner's own uid, which is exactly what
 * the bucket's insert policy checks. The file name is a fresh id rather than
 * anything from the partner's phone: original names collide ("IMG_0001.jpg"),
 * carry spaces and non-ASCII characters into a URL, and occasionally say more
 * about the owner than they meant to share. The extension always matches what
 * was encoded, never what was picked.
 */
export function photoObjectPath(uid: string, id: string, format: PhotoOutputFormat): string {
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
  return `${uid}/${safeId}.${format.extension}`;
}

/** Whether an object path sits in this user's own folder of the bucket. */
export function ownsPhotoPath(path: string, uid: string): boolean {
  return uid !== "" && path.startsWith(`${uid}/`) && !path.includes("..");
}
