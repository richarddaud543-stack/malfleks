import { PRODUCT_ICON_KEYS } from "./product-icons";

/**
 * Validating a product a partner wants to list.
 *
 * Pure, and the same shape as `validatePartnerApplication` and
 * `validateOrderRequest`: strings in, a per-field error record out, a
 * discriminated result so the success branch narrows without a cast. The
 * browser runs this so the partner is told early; `submitProduct` checks the
 * same things again on the server, and that copy is the one that counts.
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

export function validateProductListing(
  input: ProductListingInput,
): ProductListingValidation {
  const errors: ProductListingErrors = {};

  const name = input.name.trim();
  const category = input.category.trim();
  const description = input.description.trim();
  const image = input.image.trim();

  if (name.length < MIN_NAME) {
    errors.name = "Give the product a name customers would recognise.";
  }

  if (category === "") {
    errors.category = "Say what kind of product this is.";
  }

  if (description.length < MIN_DESCRIPTION) {
    errors.description =
      "Describe it in a sentence or two — this is what a customer reads before ordering.";
  } else if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  }

  if (image === "") {
    errors.image = "Choose the picture that fits this product best.";
  } else if (!(PRODUCT_ICON_KEYS as readonly string[]).includes(image)) {
    // A key outside the set renders as a smartphone regardless of what was
    // listed, which is silently wrong on a car. Caught here rather than shown.
    errors.image = "That isn't one of the pictures we can show.";
  }

  const price = input.price.trim().replace(/[,\s]/g, "");
  if (price === "") {
    errors.price = "Give the price in whole shillings.";
  } else if (!/^\d+$/.test(price)) {
    // Deliberately stricter than `Number()`: "1.25e6" and "0x10" both parse to
    // something, and neither is what a shopkeeper meant to type.
    errors.price = "Digits only — whole shillings, no decimals.";
  } else {
    const parsed = Number(price);
    if (parsed <= 0) {
      errors.price = "The price has to be more than zero.";
    } else if (parsed > MAX_PRICE_TZS) {
      errors.price = "That price looks like a typo. Check the zeros.";
    }
  }

  const specs = input.specs
    .map((spec) => ({ key: spec.key.trim(), value: spec.value.trim() }))
    .filter((spec) => spec.key !== "" || spec.value !== "");

  // A half-filled row is a mistake, not a spec. Saying so beats dropping it
  // quietly and letting the partner wonder where it went.
  if (specs.some((spec) => spec.key === "" || spec.value === "")) {
    errors.specs = "Every detail needs both a label and a value.";
  } else if (specs.length > MAX_SPECS) {
    errors.specs = `That's more than ${MAX_SPECS} details — keep the ones that matter.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      category,
      description,
      image,
      priceTZS: Number(price),
      inStock: input.inStock,
      specs,
    },
  };
}
