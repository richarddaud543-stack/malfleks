import { describe, expect, it } from "vitest";

import { businessLines, businessSignature, missingBusinessDetails, MALFLEKS_BUSINESS, type BusinessDetails } from "./business";
import { MALFLEKS_CONTACT_EMAIL } from "./contact";

const FILLED: BusinessDetails = {
  tradingName: "MalFleks",
  legalName: "MalFleks Enterprises",
  legalStatus: { en: "Registered business name (BRELA)", sw: "Jina la biashara lililosajiliwa (BRELA)" },
  registrationNumber: "123456",
  tin: "100-200-300",
  placeOfBusiness: "Dar es Salaam",
  physicalAddress: "Plot 1, Example Street, Dar es Salaam",
  phone: "+255 700 000 000",
  email: "hello@example.test",
};

describe("MalFleks's business details (Electronic Transactions Act s.28)", () => {
  it("always names the business and gives an email, even before registration", () => {
    const lines = businessLines("en");
    expect(lines[0]).toEqual({ label: "Name", value: "MalFleks" });
    expect(lines.at(-1)).toEqual({ label: "Email", value: MALFLEKS_CONTACT_EMAIL, href: `mailto:${MALFLEKS_CONTACT_EMAIL}` });
  });

  it("never shows a blank or invented line for something not yet filled in", () => {
    for (const line of businessLines("en")) expect(line.value.trim()).not.toBe("");
    expect(businessLines("en").map((l) => l.label)).not.toContain("TIN");
  });

  it("shows every field once filled in, in the order the Act lists them, in both languages", () => {
    expect(businessLines("en", FILLED).map((l) => l.label)).toEqual([
      "Name",
      "Legal status",
      "Registration number",
      "TIN",
      "Place of business",
      "Physical address",
      "Telephone",
      "Email",
    ]);
    expect(businessLines("en", FILLED)[0].value).toBe("MalFleks (MalFleks Enterprises)");
    expect(businessLines("sw", FILLED)[1]).toEqual({ label: "Hadhi ya kisheria", value: "Jina la biashara lililosajiliwa (BRELA)" });
    expect(businessLines("en", FILLED).find((l) => l.label === "Telephone")?.href).toBe("tel:+255700000000");
  });

  it("signs an email with whatever is known", () => {
    expect(businessSignature()).toBe(`MalFleks · Tanzania · ${MALFLEKS_CONTACT_EMAIL}`);
    expect(businessSignature(FILLED)).toBe(
      "MalFleks (MalFleks Enterprises) · Plot 1, Example Street, Dar es Salaam · +255 700 000 000 · hello@example.test",
    );
  });

  it("lists what the law asks for that is still missing", () => {
    expect(missingBusinessDetails(FILLED)).toEqual([]);
    const missing = missingBusinessDetails(MALFLEKS_BUSINESS);
    // A reminder in every test run until the owner fills these in after registering.
    if (missing.length > 0) console.warn(`[business details] still to fill in src/lib/business.ts: ${missing.join(", ")}`);
    expect(Array.isArray(missing)).toBe(true);
  });
});
