/**
 * The rules a product's photos must pass, shared by the browser form
 * (`ProductPhotoUpload`, for an early error), the server (`submitProduct`,
 * the copy that counts), and every component that draws a photo.
 *
 * A product has **up to six photos**. `Product.photoUrls` holds them in the
 * order shoppers see them and `Product.photoUrl` is always the first — "the
 * main photo", the one on cards and in search. Photos are optional and
 * additive to the icon (see `product-icons.ts`): a listing with none is still
 * complete.
 *
 * When a photo is set it must be a public URL under this project's own
 * `product-photos` Supabase Storage bucket, never an arbitrary external image.
 * The upload widget only ever produces URLs of this shape (from
 * `supabase.storage.from("product-photos").getPublicUrl(...)`), so the check
 * exists to catch a forged or hand-edited value arriving at the server, not
 * to validate a well-behaved upload.
 */

/** The Storage bucket every product photo lives in. */
export const PRODUCT_PHOTO_BUCKET = "product-photos";

/**
 * Six, not "as many as you like". Enough for front, back, the sides, what is
 * in the box and any damage; few enough that a product page on a patchy
 * connection is not asked to pull down a dozen images nobody swipes to.
 */
export const MAX_PRODUCT_PHOTOS = 6;

/**
 * The path every public product photo sits under on the Storage host. Also
 * what `next.config.ts` allow-lists for image optimisation — one string, so
 * the two cannot drift apart.
 */
export const PRODUCT_PHOTO_PUBLIC_PATH = `/storage/v1/object/public/${PRODUCT_PHOTO_BUCKET}/`;

/** `""` when Supabase is not configured — and then nothing is a valid photo. */
export function productPhotoPrefix(supabaseUrl: string): string {
  const base = supabaseUrl.trim().replace(/\/+$/, "");
  return base === "" ? "" : `${base}${PRODUCT_PHOTO_PUBLIC_PATH}`;
}

export function isValidProductPhotoUrl(url: string, supabaseUrl: string): boolean {
  const prefix = productPhotoPrefix(supabaseUrl);
  if (prefix === "") return false;
  return url.startsWith(prefix) && url.length > prefix.length;
}

export type ProductPhotoListCheck =
  | { ok: true; urls: string[] }
  | { ok: false; reason: "invalid" | "too-many" };

/**
 * Cleans a list of photo URLs: trimmed, blanks dropped, repeats removed (the
 * first occurrence keeps its place, so the main photo stays the main photo),
 * every one checked against the bucket prefix, and no more than six.
 *
 * One bad URL fails the whole list rather than being dropped quietly. A
 * partner who uploaded five photos and sees four on the live page has no way
 * to find out why; a refusal they can read is kinder.
 */
export function normalizeProductPhotoUrls(
  urls: readonly string[],
  supabaseUrl: string,
): ProductPhotoListCheck {
  const seen = new Set<string>();
  const clean: string[] = [];

  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (url === "" || seen.has(url)) continue;
    if (!isValidProductPhotoUrl(url, supabaseUrl)) {
      return { ok: false, reason: "invalid" };
    }
    seen.add(url);
    clean.push(url);
  }

  if (clean.length > MAX_PRODUCT_PHOTOS) return { ok: false, reason: "too-many" };
  return { ok: true, urls: clean };
}

/**
 * Every photo of a product, main one first.
 *
 * The one place that reads `photoUrls` and `photoUrl` together. Rows written
 * before the gallery existed have an empty list and, sometimes, a `photoUrl`
 * — those come back as a one-photo list, so no caller has to remember the
 * history of the column.
 */
export function productPhotoList(product: {
  photoUrl?: string | null;
  photoUrls?: readonly string[] | null;
}): string[] {
  const list = (product.photoUrls ?? []).filter((url) => url.trim() !== "");
  if (list.length > 0) return [...list];
  const single = product.photoUrl?.trim();
  return single ? [single] : [];
}

/**
 * The object path inside the bucket (`<uid>/<file>`) for one of our public
 * URLs, or `null` if the URL is not one of ours. This is what
 * `storage.from(bucket).remove([path])` wants when a partner takes a photo
 * back off a listing they have not sent yet.
 */
export function productPhotoPath(url: string, supabaseUrl: string): string | null {
  if (!isValidProductPhotoUrl(url, supabaseUrl)) return null;
  const path = url.slice(productPhotoPrefix(supabaseUrl).length).split(/[?#]/)[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Whether a photo may go through the Next.js image optimiser.
 *
 * `next.config.ts` allow-lists exactly one remote path — this project's own
 * bucket — and only when `NEXT_PUBLIC_SUPABASE_URL` was set at build time.
 * Anything else (the variable missing in a test run or a bare local build, or
 * a URL from somewhere unexpected) is drawn as a plain image instead: asking
 * the optimiser for a host it was never told about is a 400 in production and
 * a thrown error in development.
 */
export function canOptimizeProductPhoto(url: string, supabaseUrl: string): boolean {
  if (!isValidProductPhotoUrl(url, supabaseUrl)) return false;
  // The allow-list entry carries no query string, so a URL with one would be
  // refused by the optimiser even though the prefix matches.
  return !/[?#]/.test(url);
}
