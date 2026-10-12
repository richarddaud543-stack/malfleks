import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";
import type { Locale } from "@/i18n/locale";

/**
 * Who MalFleks is, in the words the law asks for.
 *
 * Tanzania's Electronic Transactions Act, 2015, s.28(1), requires anyone
 * selling goods or services online to make available: (a) full name, legal
 * status and place of business; (b) contact details including physical
 * address, telephone and e-mail. If a supplier does not, the customer may
 * cancel within fourteen days of receiving the goods (s.28(3)), which is a
 * longer right than the ordinary seven.
 *
 * Until 12 Oct 2026 the site published one Gmail address and nothing else.
 * This is the one place those details live; the Terms, the contact page and
 * every email a customer or partner receives read it, so the business details
 * cannot say one thing on the Terms and another in an inbox.
 *
 * **Deliberately constants, not env vars**, for the reason `contact.ts` gives:
 * a legal notice that can silently lose a line because a deployment was
 * missing a variable is worse than one that is plainly incomplete. A field
 * that is `null` is simply not shown -- nothing on the site invents a
 * registration that has not happened.
 *
 * ## To fill in, once MalFleks is registered with BRELA and has a TIN
 *
 * Every `null` below. `missingBusinessDetails()` lists what is still empty, and
 * `business.test.ts` prints that list, so it is visible in every test run
 * until it is done.
 */
export interface BusinessDetails {
  /** The name customers see. */
  tradingName: string;
  /** The name exactly as registered with BRELA. */
  legalName: string | null;
  /** What kind of business it is, e.g. a registered business name or a limited company. */
  legalStatus: Record<Locale, string> | null;
  /** The BRELA registration or incorporation number. */
  registrationNumber: string | null;
  /** The TRA taxpayer identification number. */
  tin: string | null;
  /** The town or city MalFleks is run from. */
  placeOfBusiness: string | null;
  /** A street address a letter or a visitor could actually reach. */
  physicalAddress: string | null;
  /** A number that is answered, in +255 form. */
  phone: string | null;
  email: string;
}

export const MALFLEKS_BUSINESS: BusinessDetails = {
  tradingName: "MalFleks",
  legalName: null,
  legalStatus: null,
  registrationNumber: null,
  tin: null,
  placeOfBusiness: null,
  physicalAddress: null,
  phone: null,
  email: MALFLEKS_CONTACT_EMAIL,
};

/** The fields s.28(1)(a)–(b) asks for that are still empty. */
export function missingBusinessDetails(details: BusinessDetails = MALFLEKS_BUSINESS): string[] {
  const required: (keyof BusinessDetails)[] = ["legalName", "legalStatus", "placeOfBusiness", "physicalAddress", "phone"];
  return required.filter((key) => details[key] === null || details[key] === "");
}

const LABELS: Record<Locale, Record<"name" | "status" | "registration" | "tin" | "place" | "address" | "phone" | "email", string>> = {
  en: {
    name: "Name",
    status: "Legal status",
    registration: "Registration number",
    tin: "TIN",
    place: "Place of business",
    address: "Physical address",
    phone: "Telephone",
    email: "Email",
  },
  sw: {
    name: "Jina",
    status: "Hadhi ya kisheria",
    registration: "Namba ya usajili",
    tin: "TIN",
    place: "Mahali pa biashara",
    address: "Anwani ya mahali",
    phone: "Simu",
    email: "Barua pepe",
  },
};

export interface BusinessLine {
  label: string;
  value: string;
  /** `tel:` or `mailto:` for the two a reader may want to use straight away. */
  href?: string;
}

/** The details that are filled in, labelled in the reader's language, in the order s.28 lists them. */
export function businessLines(locale: Locale, details: BusinessDetails = MALFLEKS_BUSINESS): BusinessLine[] {
  const label = LABELS[locale];
  const lines: (BusinessLine | null)[] = [
    {
      label: label.name,
      value: details.legalName && details.legalName !== details.tradingName ? `${details.tradingName} (${details.legalName})` : details.tradingName,
    },
    details.legalStatus ? { label: label.status, value: details.legalStatus[locale] } : null,
    details.registrationNumber ? { label: label.registration, value: details.registrationNumber } : null,
    details.tin ? { label: label.tin, value: details.tin } : null,
    details.placeOfBusiness ? { label: label.place, value: details.placeOfBusiness } : null,
    details.physicalAddress ? { label: label.address, value: details.physicalAddress } : null,
    details.phone ? { label: label.phone, value: details.phone, href: `tel:${details.phone.replace(/\s+/g, "")}` } : null,
    { label: label.email, value: details.email, href: `mailto:${details.email}` },
  ];
  return lines.filter((line): line is BusinessLine => line !== null);
}

/**
 * One line naming the sender, for the foot of an email: who it is from and
 * how to reach them. Plain text, so it reads the same in every mail client.
 */
export function businessSignature(details: BusinessDetails = MALFLEKS_BUSINESS): string {
  const name = details.legalName && details.legalName !== details.tradingName ? `${details.tradingName} (${details.legalName})` : details.tradingName;
  return [name, details.physicalAddress ?? details.placeOfBusiness ?? "Tanzania", details.phone, details.email]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
