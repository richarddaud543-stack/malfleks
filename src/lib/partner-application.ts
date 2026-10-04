import { APPLY } from "@/i18n/copy/apply";
import type { Locale } from "@/i18n/locale";
import { normalizePhone } from "./order";

/**
 * Validating a brand branch's or a courier's application to join MalFleks.
 *
 * Pure, and the same shape as `validateOrderRequest` in `order.ts`: strings in,
 * a per-field error record out, and a discriminated result so the success
 * branch narrows without a cast. The browser runs this for the customer's
 * benefit and the server runs it again for real — the client copy is a
 * convenience, this one is the one that counts.
 *
 * **Phone validation is deliberately not reimplemented here.** `normalizePhone`
 * already encodes the Tanzanian mobile rule (a `+255` or `0` prefix, nine
 * digits starting 6 or 7) and a second copy of that rule in the same codebase
 * would be a bug waiting for someone to fix only one of them.
 */

export type PartnerKind = "brand" | "courier";

/** The cities MalFleks serves. Every branch and courier record sits in one. */
export const SERVED_CITIES = [
  "Dar es Salaam",
  "Arusha",
  "Mwanza",
  "Dodoma",
] as const;

export type ServedCity = (typeof SERVED_CITIES)[number];

export function isServedCity(value: string): value is ServedCity {
  return (SERVED_CITIES as readonly string[]).includes(value);
}

export interface PartnerApplicationInput {
  kind: PartnerKind;
  businessName: string;
  contactName: string;
  phone: string;
  city: string;
  /** A brand already in the catalogue, or `""` when naming one that is not. */
  brandId: string;
  /** The brand's name when it is not in the catalogue. */
  brandOther: string;
  /** Branch applications only — a courier serves a city, not an address. */
  address: string;
  notes: string;
}

export const emptyPartnerApplication: PartnerApplicationInput = {
  kind: "brand",
  businessName: "",
  contactName: "",
  phone: "",
  city: "",
  brandId: "",
  brandOther: "",
  address: "",
  notes: "",
};

export type PartnerApplicationField = keyof PartnerApplicationInput;

export type PartnerApplicationErrors = Partial<
  Record<PartnerApplicationField, string>
>;

/** What survives validation: trimmed, normalised, and safe to store. */
export interface ValidatedPartnerApplication {
  kind: PartnerKind;
  businessName: string;
  contactName: string;
  /** `+255…`, never what was typed. */
  phone: string;
  city: ServedCity;
  brandId: string | null;
  brandOther: string | null;
  address: string | null;
  notes: string | null;
}

export type PartnerApplicationValidation =
  | { ok: true; value: ValidatedPartnerApplication }
  | { ok: false; errors: PartnerApplicationErrors };

const MIN_BUSINESS_NAME = 2;
const MIN_CONTACT_NAME = 2;
const MIN_ADDRESS = 6;
export const MAX_NOTES = 600;

/**
 * @param knownBrandIds ids the catalogue actually has, so a hand-edited form
 *   cannot attach an application to a brand that does not exist. Passed in
 *   rather than imported, because this module must stay free of data imports to
 *   remain usable from a client component.
 */
export function validatePartnerApplication(
  input: PartnerApplicationInput,
  knownBrandIds: readonly string[],
  locale: Locale = "en"
): PartnerApplicationValidation {
  const words = APPLY[locale].errors;
  const errors: PartnerApplicationErrors = {};

  const businessName = input.businessName.trim();
  if (businessName.length < MIN_BUSINESS_NAME) {
    errors.businessName =
      input.kind === "brand"
        ? words.businessBrand
        : words.businessCourier;
  }

  const contactName = input.contactName.trim();
  if (contactName.length < MIN_CONTACT_NAME) {
    errors.contactName = words.contact;
  }

  const phone = normalizePhone(input.phone);
  if (input.phone.trim() === "") {
    errors.phone = words.phoneMissing;
  } else if (!phone) {
    errors.phone = words.phoneInvalid;
  }

  const city = input.city.trim();
  if (city === "") {
    errors.city = words.cityMissing;
  } else if (!isServedCity(city)) {
    errors.city = words.cityUnserved;
  }

  // Brand applicants say whose brand this is; couriers carry for everyone, so
  // the question is not asked of them and any answer is dropped rather than
  // treated as an error.
  const brandId = input.brandId.trim();
  const brandOther = input.brandOther.trim();
  if (input.kind === "brand") {
    if (brandId === "" && brandOther === "") {
      errors.brandId = words.brandMissing;
    } else if (brandId !== "" && !knownBrandIds.includes(brandId)) {
      errors.brandId = words.brandUnknown;
    }
  }

  const address = input.address.trim();
  if (input.kind === "brand" && address.length < MIN_ADDRESS) {
    errors.address = words.address;
  }

  const notes = input.notes.trim();
  if (notes.length > MAX_NOTES) {
    errors.notes = words.notes(MAX_NOTES);
  }

  // `!phone` is unreachable once `errors` is empty; it is here so the success
  // branch narrows without a cast, same as `validateOrderRequest`.
  if (Object.keys(errors).length > 0 || !phone || !isServedCity(city)) {
    return { ok: false, errors };
  }

  const isBrand = input.kind === "brand";
  return {
    ok: true,
    value: {
      kind: input.kind,
      businessName,
      contactName,
      phone,
      city,
      // Only one of these is ever kept, and only for a brand applicant. A
      // courier's stray brand answer is discarded here rather than stored and
      // puzzled over by whoever reviews it.
      brandId: isBrand && brandId !== "" ? brandId : null,
      brandOther: isBrand && brandId === "" && brandOther !== "" ? brandOther : null,
      address: isBrand ? address : null,
      notes: notes === "" ? null : notes,
    },
  };
}
