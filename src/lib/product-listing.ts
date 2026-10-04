import { PARTNER } from "@/i18n/copy/partner";
import type { Locale } from "@/i18n/locale";
import { canonicalCategory, normalizeCategory } from "./product-categories";
import { PRODUCT_ICON_KEYS } from "./product-icons";
import { MAX_PRODUCT_PHOTOS, normalizeProductPhotoUrls } from "./product-photo";

/**
 * Validating a product a partner wants to list.
 *
 * Pure, and the same shape as `validatePartnerApplication` and
 * `validateOrderRequest`: strings in, a per-field error record out, a
 * discriminated result so the success branch narrows without a cast. The
 * browser runs this so the partner is told early; `submitProduct` runs **this
 * same function** again on the server, and that copy is the one that counts.
 *
 * That sentence used to be a promise rather than a fact: the server checked
 * only for blank fields and a positive price, so the description length, the
 * 12-detail cap, the picture whitelist and the price ceiling were enforced in
 * the browser alone — which is to say, not enforced. A Server Action is a
 * public endpoint; anything only the form refuses, a script can send. There
 * is one set of rules now, and `submissions.integration.test.ts` proves the
 * server refuses each of them.
 *
 * ## Why the price is a string here
 *
 * A form gives you `"1,250,000"`, `"1250000 "`, `"1.25e6"` and `""`. The
 * database column is `Int` and `submitProduct` rejects anything that is not a
 * positive integer — so *something* has to do the parsing, and doing it here
 * means the partner reads "Give the price in whole shillings" instead of
 * watching a submission fail for a reason nobody explains. `Number("")` is `0`
 * and `Number(" ")` is `0`, which is exactly the class of bug that made
 * `NEXT_PUBLIC_SITE_URL=""` cost three deployments in this repo, so the empty
 * case is checked before the parse, never after it.
 */

export interface ProductListingInput {
  name: string;
  category: string;
  description: string;
  /** A `ProductIconKey`. Not a URL — see the note on `PRODUCT_ICON_KEYS`. */
  image: string;
  /**
   * Real, uploaded photos — optional, additive to `image`, main one first.
   * An empty list means "no photo, just the icon," which is a valid, complete
   * listing. At most six; see `MAX_PRODUCT_PHOTOS`.
   */
  photoUrls: string[];
  /** As typed. Parsed here, not by the caller. */
  price: string;
  inStock: boolean;
  specs: { key: string; value: string }[];
}

export const emptyProductListing: ProductListingInput = {
  name: "",
  category: "",
  description: "",
  image: "",
  photoUrls: [],
  price: "",
  inStock: true,
  specs: [{ key: "", value: "" }],
};

export type ProductListingField = keyof ProductListingInput;

export type ProductListingErrors = Partial<
  Record<ProductListingField, string>
>;

/** What survives validation: trimmed, parsed, and safe to hand to Prisma. */
export interface ValidatedProductListing {
  name: string;
  category: string;
  description: string;
  image: string;
  /** De-duplicated, main photo first. Empty when no photo was uploaded. */
  photoUrls: string[];
  /** The main photo — `photoUrls[0]` — or an empty string when there is none. */
  photoUrl: string;
  /** Whole shillings, a positive integer. */
  priceTZS: number;
  inStock: boolean;
  /** Blank rows dropped. May be empty. */
  specs: { key: string; value: string }[];
}

export type ProductListingValidation =
  | { ok: true; value: ValidatedProductListing }
  | { ok: false; errors: ProductListingErrors };

const MIN_NAME = 2;
const MIN_DESCRIPTION = 20;
export const MAX_DESCRIPTION = 800;
export const MAX_SPECS = 12;

/**
 * The largest price the form will accept: 2,000,000,000 TZS.
 *
 * Not arbitrary. `priceTZS` is a Postgres `Int`, which tops out at 2,147,483,647
 * — a partner typing an extra zero on a car price would otherwise be told
 * nothing here and get an opaque database error two layers down.
 */
export const MAX_PRICE_TZS = 2_000_000_000;

export interface ProductListingOptions {
  /** The language of the messages. The form passes the one the page is in. */
  locale?: Locale;
  /**
   * The Supabase project URL photo URLs are checked against. Defaults to
   * `NEXT_PUBLIC_SUPABASE_URL`, which is the right answer in the browser; the
   * server passes the value it resolved through `supabaseAuthConfig()` so the
   * two layers cannot disagree about which project "ours" means.
   */
  supabaseUrl?: string;
}

export function validateProductListing(
  input: ProductListingInput,
  options: ProductListingOptions = {},
): ProductListingValidation {
  const words = PARTNER[options.locale ?? "en"].listing.errors;
  const errors: ProductListingErrors = {};

  const name = input.name.trim();
  // A known category in its one spelling ("phones " becomes "Phones"); an
  // unknown one as typed, trimmed and single-spaced. See `product-categories`.
  const category = normalizeCategory(input.category);
  const description = input.description.trim();
  const image = input.image.trim();

  if (name.length < MIN_NAME) {
    errors.name = words.name;
  }

  if (category === "") {
    errors.category = words.categoryMissing;
  } else if (!canonicalCategory(category)) {
    // A kind we do not have would become its own search filter on the shop.
    // The form only offers the list; this is the server holding the same line
    // against a request that did not come from the form.
    errors.category = words.categoryUnknown;
  }

  if (description.length < MIN_DESCRIPTION) {
    errors.description = words.descriptionShort;
  } else if (description.length > MAX_DESCRIPTION) {
    errors.description = words.descriptionLong(MAX_DESCRIPTION);
  }

  if (image === "") {
    errors.image = words.imageMissing;
  } else if (!(PRODUCT_ICON_KEYS as readonly string[]).includes(image)) {
    // A key outside the set renders as a smartphone regardless of what was
    // listed, which is silently wrong on a car. Caught here rather than shown.
    errors.image = words.imageUnknown;
  }

  // Optional. `ProductPhotoUpload` only ever hands back URLs from our own
  // bucket, so a value that fails this check means an upload failed partway
  // — not a typo a partner could fix by re-typing it.
  const supabaseUrl =
    options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const photos = normalizeProductPhotoUrls(input.photoUrls ?? [], supabaseUrl);
  if (!photos.ok) {
    errors.photoUrls =
      photos.reason === "too-many"
        ? words.photosTooMany(MAX_PRODUCT_PHOTOS)
        : words.photosBroken;
  }

  const price = input.price.trim().replace(/[,\s]/g, "");
  if (price === "") {
    errors.price = words.priceMissing;
  } else if (!/^\d+$/.test(price)) {
    // Deliberately stricter than `Number()`: "1.25e6" and "0x10" both parse to
    // something, and neither is what a shopkeeper meant to type.
    errors.price = words.priceDigits;
  } else {
    const parsed = Number(price);
    if (parsed <= 0) {
      errors.price = words.priceZero;
    } else if (parsed > MAX_PRICE_TZS) {
      errors.price = words.priceHuge;
    }
  }

  const specs = input.specs
    .map((spec) => ({ key: spec.key.trim(), value: spec.value.trim() }))
    .filter((spec) => spec.key !== "" || spec.value !== "");

  // A half-filled row is a mistake, not a spec. Saying so beats dropping it
  // quietly and letting the partner wonder where it went.
  if (specs.some((spec) => spec.key === "" || spec.value === "")) {
    errors.specs = words.specsHalf;
  } else if (specs.length > MAX_SPECS) {
    errors.specs = words.specsTooMany(MAX_SPECS);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      category,
      description,
      image,
      photoUrls: photos.ok ? photos.urls : [],
      photoUrl: photos.ok ? (photos.urls[0] ?? "") : "",
      priceTZS: Number(price),
      inStock: input.inStock,
      specs,
    },
  };
}
