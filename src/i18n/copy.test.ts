import { describe, expect, it } from "vitest";

import { ACCOUNT } from "./copy/account";
import { APPLY, CONTACT } from "./copy/apply";
import { CHROME } from "./copy/chrome";
import { carrierLabel, ORDER } from "./copy/order";
import { iconLabel, PARTNER, pingNoteLabel, specLabel } from "./copy/partner";
import { PLACES } from "./copy/places";
import { categoryLabel, SHOP } from "./copy/shop";
import { PRODUCT_CATEGORIES, CATEGORY_SPEC_SUGGESTIONS } from "@/lib/product-categories";
import { PRODUCT_ICON_KEYS, PRODUCT_ICON_LABELS } from "@/lib/product-icons";

/**
 * The site's words exist twice, in English and in Swahili. These tests hold
 * the two to the same shape, so that adding a sentence in one language and
 * forgetting the other fails here rather than showing a visitor a blank or a
 * line of the wrong language.
 *
 * They cannot check that the Swahili *means* what the English means; that is
 * the owner's reading. They check what a machine can.
 */
const COPIES = { ACCOUNT, APPLY, CONTACT, CHROME, ORDER, PARTNER, PLACES, SHOP } as const;

type Leaf = { path: string; value: unknown };

function leaves(value: unknown, path = ""): Leaf[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => leaves(inner, path ? `${path}.${key}` : key));
  }
  return [{ path, value }];
}

/** Things that are the same word in both languages, on purpose. */
const SAME_IN_BOTH = new Set([
  "dateLocale",
  "language.names.sw",
  "language.names.en",
  "language.short.sw",
  "language.short.en",
  "search.priceBands.100k-1m",
  "search.priceBands.1m-10m",
  "search.priceBands.10m-100m",
]);

describe.each(Object.entries(COPIES))("%s", (_name, copy) => {
  const en = leaves(copy.en);
  const sw = leaves(copy.sw);

  it("has every entry in both languages", () => {
    expect(sw.map((leaf) => leaf.path).sort()).toEqual(en.map((leaf) => leaf.path).sort());
  });

  it("has the same kind of thing at every entry: a sentence, or a sentence with blanks to fill", () => {
    const kindsEn = Object.fromEntries(en.map((leaf) => [leaf.path, typeof leaf.value]));
    for (const leaf of sw) {
      expect(typeof leaf.value, leaf.path).toBe(kindsEn[leaf.path]);
      if (typeof leaf.value === "function") {
        const twin = en.find((other) => other.path === leaf.path)!.value as (...args: unknown[]) => unknown;
        expect(leaf.value.length, `${leaf.path} takes the same blanks`).toBe(twin.length);
      }
    }
  });

  it("leaves nothing blank, and nothing in Swahili still in English", () => {
    const english = new Map(en.map((leaf) => [leaf.path, leaf.value]));
    for (const leaf of sw) {
      if (typeof leaf.value !== "string") continue;
      expect(leaf.value.trim(), leaf.path).not.toBe("");
      if (leaf.path === "dateLocale") {
        expect(leaf.value).toBe("sw-TZ");
        continue;
      }
      if (SAME_IN_BOTH.has(leaf.path)) continue;
      // A full stop is a full stop in any language.
      if (!/\p{L}{3,}/u.test(leaf.value)) continue;
      expect(leaf.value, `${leaf.path} is the same in both languages`).not.toBe(english.get(leaf.path));
    }
  });
});

describe("words that are stored in English and shown in the reader's language", () => {
  it("names every product kind in Swahili, and leaves an unknown one as written", () => {
    for (const category of PRODUCT_CATEGORIES) {
      expect(categoryLabel(category, "en")).toBe(category);
      expect(categoryLabel(category, "sw").trim(), category).not.toBe("");
    }
    expect(categoryLabel("Smartphone", "sw")).toBe("Simu janja");
    // "wet" was a real kind on the live shop before the list existed.
    expect(categoryLabel("wet", "sw")).toBe("wet");
  });

  it("names every picture a seller can pick", () => {
    for (const key of PRODUCT_ICON_KEYS) {
      expect(iconLabel(key, PRODUCT_ICON_LABELS[key], "en")).toBe(PRODUCT_ICON_LABELS[key]);
      expect(iconLabel(key, PRODUCT_ICON_LABELS[key], "sw").trim(), key).not.toBe("");
    }
  });

  it("names every detail the listing form suggests", () => {
    const labels = new Set(Object.values(CATEGORY_SPEC_SUGGESTIONS).flatMap((list) => [...(list ?? [])]));
    for (const label of labels) {
      expect(specLabel(label, "en")).toBe(label);
      // Each has a Swahili entry: asking for one never falls back silently.
      expect(specLabel(label, "sw"), label).toBeTruthy();
    }
    expect(specLabel("Warranty", "sw")).toBe("Dhamana");
  });

  it("shows a courier's update and a brand's own delivery in the reader's language", () => {
    expect(pingNoteLabel("On the way", "sw")).toBe("Uko njiani");
    expect(pingNoteLabel("On the way", "en")).toBe("On the way");
    expect(pingNoteLabel("Stuck in traffic", "sw")).toBe("Stuck in traffic");

    expect(carrierLabel("Toyota own fleet", "sw")).toBe("Usafirishaji wa Toyota yenyewe");
    expect(carrierLabel("Toyota own fleet", "en")).toBe("Toyota own fleet");
    // A courier's name is a name.
    expect(carrierLabel("Bolt Send", "sw")).toBe("Bolt Send");
  });
});

describe("the rule both languages keep", () => {
  // Nothing may promise how long a refund or a delivery takes, or name a
  // mobile money network: neither is decided, and the pay page shows the
  // networks that are switched on. (Times a courier *publishes* -- "siku
  // 1–2" -- are their own promise and are built from numbers, not written
  // here.)
  it.each(["en", "sw"] as const)("names no mobile money network (%s)", (locale) => {
    for (const copy of Object.values(COPIES)) {
      for (const leaf of leaves(copy[locale])) {
        if (typeof leaf.value !== "string") continue;
        expect(leaf.value, leaf.path).not.toMatch(/\b(m-?pesa|airtel|tigo|mixx|halopesa|vodacom)\b/i);
      }
    }
  });

  it("tells a seller the same thing in the same words everywhere: nothing is handed over until it is paid", () => {
    const paid = "Imelipwa kupitia MalFleks";
    expect(PARTNER.sw.card.paid.strong).toContain(paid);
    for (const sentence of [
      PARTNER.sw.orders.introBranch,
      PARTNER.sw.orders.introCourier,
      PARTNER.sw.card.unpaid,
      PARTNER.sw.decide.doneConfirmed,
    ]) {
      expect(sentence).toContain(paid);
    }
  });
});
