import { describe, expect, it } from "vitest";

import {
  MAX_INPUT_BYTES,
  MAX_LONG_SIDE,
  MIN_SHORT_SIDE,
  PHOTO_MESSAGES,
  checkPhotoDimensions,
  checkPhotoFile,
  encodedAsWebp,
  isHeicFile,
  outputFormatFor,
  ownsPhotoPath,
  photoObjectPath,
  targetDimensions,
} from "./photo-prep";

/**
 * The decisions behind shrinking a photo before upload. The canvas itself
 * cannot run here; everything it is told to do can.
 */

const jpeg = (size: number, name = "IMG_0001.jpg") => ({ type: "image/jpeg", size, name });

describe("checkPhotoFile", () => {
  it("accepts the ordinary photo types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkPhotoFile({ type, size: 1_000_000, name: "a" })).toBeNull();
    }
  });

  it("accepts a phone photo well over the old 5 MB limit, up to 15 MB", () => {
    expect(checkPhotoFile(jpeg(12 * 1024 * 1024))).toBeNull();
    expect(checkPhotoFile(jpeg(MAX_INPUT_BYTES))).toBeNull();
    expect(checkPhotoFile(jpeg(MAX_INPUT_BYTES + 1))).toBe(PHOTO_MESSAGES.tooBig);
  });

  it("refuses something that is not a photo", () => {
    expect(checkPhotoFile({ type: "video/mp4", size: 10, name: "clip.mp4" })).toBe(
      PHOTO_MESSAGES.wrongType,
    );
    expect(checkPhotoFile({ type: "application/pdf", size: 10, name: "a.pdf" })).toBe(
      PHOTO_MESSAGES.wrongType,
    );
    expect(checkPhotoFile({ type: "image/svg+xml", size: 10, name: "a.svg" })).toBe(
      PHOTO_MESSAGES.wrongType,
    );
  });

  it("lets an iPhone HEIC photo through to be decoded, by type or by extension", () => {
    expect(checkPhotoFile({ type: "image/heic", size: 10, name: "IMG_1.HEIC" })).toBeNull();
    expect(checkPhotoFile({ type: "image/heif", size: 10, name: "IMG_1.heif" })).toBeNull();
    // Several Android pickers report no type at all for these.
    expect(checkPhotoFile({ type: "", size: 10, name: "IMG_1.HEIC" })).toBeNull();
  });

  it("does not treat a typeless file as a photo just because of its name", () => {
    expect(checkPhotoFile({ type: "", size: 10, name: "notes.txt" })).toBe(PHOTO_MESSAGES.wrongType);
    expect(checkPhotoFile({ type: "", size: 10, name: "heic" })).toBe(PHOTO_MESSAGES.wrongType);
  });
});

describe("isHeicFile", () => {
  it("does not let an extension override a real type", () => {
    // A JPEG that someone renamed is still a JPEG.
    expect(isHeicFile({ type: "image/jpeg", name: "photo.heic" })).toBe(false);
    expect(isHeicFile({ type: "image/heic", name: "photo" })).toBe(true);
  });
});

describe("checkPhotoDimensions", () => {
  it("refuses a photo whose shortest side is under 500 pixels, with the sentence the partner reads", () => {
    expect(checkPhotoDimensions(499, 2000)).toBe(
      "This photo is too small to show clearly — use one at least 500 pixels wide.",
    );
    expect(checkPhotoDimensions(2000, 499)).toBe(PHOTO_MESSAGES.tooSmall);
    expect(checkPhotoDimensions(320, 240)).toBe(PHOTO_MESSAGES.tooSmall);
  });

  it("accepts exactly the minimum", () => {
    expect(checkPhotoDimensions(MIN_SHORT_SIDE, MIN_SHORT_SIDE)).toBeNull();
    expect(checkPhotoDimensions(4000, 3000)).toBeNull();
  });

  it("treats a zero or missing size as unreadable, not as too small", () => {
    expect(checkPhotoDimensions(0, 0)).toBe(PHOTO_MESSAGES.unreadable);
    expect(checkPhotoDimensions(Number.NaN, 800)).toBe(PHOTO_MESSAGES.unreadable);
  });
});

describe("targetDimensions", () => {
  it("brings the longest side down to 1600 and keeps the shape", () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(targetDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(targetDimensions(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it("never scales a photo up", () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(MAX_LONG_SIDE, 900)).toEqual({ width: MAX_LONG_SIDE, height: 900 });
  });

  it("keeps the aspect ratio to within a pixel", () => {
    for (const [w, h] of [
      [5000, 1234],
      [1601, 1600],
      [9999, 501],
    ]) {
      const out = targetDimensions(w, h);
      expect(Math.max(out.width, out.height)).toBe(MAX_LONG_SIDE);
      // Each side is the exact scaled value rounded to a whole pixel.
      const scale = MAX_LONG_SIDE / Math.max(w, h);
      expect(Math.abs(out.width - w * scale)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(out.height - h * scale)).toBeLessThanOrEqual(0.5);
    }
  });

  it("never produces a zero-pixel side for an extreme panorama", () => {
    expect(targetDimensions(100_000, 10).height).toBeGreaterThanOrEqual(1);
  });
});

describe("output format", () => {
  it("uses WebP when the browser really encoded WebP", () => {
    expect(encodedAsWebp("image/webp")).toBe(true);
    expect(outputFormatFor("image/webp")).toEqual({ contentType: "image/webp", extension: "webp" });
  });

  it("recognises the PNG a browser hands back when it cannot encode WebP", () => {
    // `canvas.toBlob(cb, "image/webp")` does not fail on such a browser — it
    // returns a PNG. That is the signal to ask again for JPEG.
    expect(encodedAsWebp("image/png")).toBe(false);
    expect(encodedAsWebp("")).toBe(false);
  });

  it("names the JPEG fallback as a JPEG", () => {
    expect(outputFormatFor("image/jpeg")).toEqual({ contentType: "image/jpeg", extension: "jpg" });
  });
});

describe("photoObjectPath", () => {
  it("puts the file in the partner's own folder with the encoded format's extension", () => {
    expect(photoObjectPath("uid-1", "abc-123", outputFormatFor("image/webp"))).toBe(
      "uid-1/abc-123.webp",
    );
    expect(photoObjectPath("uid-1", "abc-123", outputFormatFor("image/jpeg"))).toBe(
      "uid-1/abc-123.jpg",
    );
  });

  it("never lets anything path-like from the id into the object name", () => {
    expect(photoObjectPath("uid-1", "../../other/x", outputFormatFor("image/webp"))).toBe(
      "uid-1/otherx.webp",
    );
  });
});

describe("ownsPhotoPath", () => {
  it("is true only inside the user's own folder", () => {
    expect(ownsPhotoPath("uid-1/a.webp", "uid-1")).toBe(true);
    expect(ownsPhotoPath("uid-2/a.webp", "uid-1")).toBe(false);
    // A uid that is a prefix of another must not match it.
    expect(ownsPhotoPath("uid-10/a.webp", "uid-1")).toBe(false);
    expect(ownsPhotoPath("uid-1/../uid-2/a.webp", "uid-1")).toBe(false);
    expect(ownsPhotoPath("uid-1/a.webp", "")).toBe(false);
  });
});
