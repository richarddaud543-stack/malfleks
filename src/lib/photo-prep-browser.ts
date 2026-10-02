import {
  JPEG_QUALITY,
  PHOTO_MESSAGES,
  WEBP_QUALITY,
  checkPhotoDimensions,
  checkPhotoFile,
  encodedAsWebp,
  isHeicFile,
  outputFormatFor,
  targetDimensions,
  type PhotoOutputFormat,
} from "./photo-prep";

/**
 * The canvas half of photo preparation. Browser-only, and thin on purpose:
 * every decision it carries out is made in `photo-prep.ts`, where it is unit
 * tested. Read the honesty rule there before changing anything here — this
 * function turns a photo the right way up, makes it smaller and re-encodes
 * it, and does nothing else to it.
 */

export type PreparedPhoto =
  | { ok: true; blob: Blob; format: PhotoOutputFormat; width: number; height: number }
  | { ok: false; message: string };

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded | null> {
  // `imageOrientation: "from-image"` applies the rotation the camera
  // recorded, so a photo taken with the phone held sideways is not uploaded
  // lying on its side.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through — some browsers can show a format in an <img> that
      // `createImageBitmap` refuses.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const refused = checkPhotoFile(file);
  if (refused) return { ok: false, message: refused };

  const decoded = await decode(file);
  if (!decoded) {
    // HEIC is accepted only where the browser can open it. Where it cannot,
    // say so in terms of what to do next rather than "unsupported format".
    return {
      ok: false,
      message: isHeicFile(file) ? PHOTO_MESSAGES.heicUnsupported : PHOTO_MESSAGES.unreadable,
    };
  }

  try {
    const tooSmall = checkPhotoDimensions(decoded.width, decoded.height);
    if (tooSmall) return { ok: false, message: tooSmall };

    const { width, height } = targetDimensions(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, message: PHOTO_MESSAGES.unreadable };

    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, width, height);

    let blob = await toBlob(canvas, "image/webp", WEBP_QUALITY);
    if (!blob || !encodedAsWebp(blob.type)) {
      // No WebP encoder (the browser handed back a PNG, or nothing). JPEG has
      // no transparency, and a see-through PNG flattened straight to JPEG
      // comes out on black — so the same pixels are redrawn over white first.
      // That is the page's own photo surface, not an edit to the item.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      blob = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
    }
    if (!blob) return { ok: false, message: PHOTO_MESSAGES.unreadable };

    return { ok: true, blob, format: outputFormatFor(blob.type), width, height };
  } finally {
    decoded.release();
  }
}
