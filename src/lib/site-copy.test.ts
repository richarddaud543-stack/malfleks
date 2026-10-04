import { describe, expect, it } from "vitest";

import { BUYER_STEPS, QUESTIONS } from "./how-it-works";
import { PROMISE } from "./promise";
import { localeAlternates, LOCALES } from "@/i18n/locale";
import { SITE_COPY, type SiteCopy } from "./site-copy";

/**
 * The English and the Swahili pages are one page written twice. These tests
 * hold the two to the same shape, so that editing one language cannot quietly
 * leave the other saying less -- or more -- than MalFleks commits to.
 *
 * They cannot check that the Swahili *means* what the English means; that is
 * the owner's reading. They check everything a machine can: the same number
 * of steps and questions, the same links in the same places, and the rules
 * both languages keep (no timings, no network names).
 */

/** Every sentence a reader can see, as one flat list. */
function sentences(copy: SiteCopy): string[] {
  const page = copy.howItWorks;
  const steps = [...copy.steps.items, ...page.buying.steps, ...page.selling.steps, ...page.delivering.steps, ...copy.moneyPath.stops];
  return [
    copy.hero.headline,
    copy.hero.headlineAccent,
    copy.hero.body,
    copy.moneyPath.refund,
    copy.openingSoon.body,
    copy.partners.body,
    page.lead,
    page.description,
    ...steps.flatMap((step) => [step.title, step.body]),
    ...page.questions.items.flatMap((item) => [item.question, item.answer]),
  ];
}

describe("the two-language pages", () => {
  it("read the English from the one place it has always been", () => {
    expect(SITE_COPY.en.steps.items).toBe(BUYER_STEPS);
    expect(SITE_COPY.en.howItWorks.questions.items).toBe(QUESTIONS);
    expect(`${SITE_COPY.en.hero.headline} ${SITE_COPY.en.hero.headlineAccent}`).toBe(PROMISE.headline);
  });

  it("open the Swahili page with the promise as it was agreed", () => {
    const { hero } = SITE_COPY.sw;
    expect(`${hero.headline} ${hero.headlineAccent}.`).toBe(PROMISE.swahili);
    // Each page shows the promise in the other language under its headline.
    expect(hero.secondLine).toBe(PROMISE.headline);
    expect(SITE_COPY.en.hero.secondLine).toBe(PROMISE.swahili);
  });

  it("have the same steps and questions in both languages, one for one", () => {
    const { en, sw } = SITE_COPY;
    expect(sw.steps.items).toHaveLength(en.steps.items.length);
    expect(sw.moneyPath.stops).toHaveLength(en.moneyPath.stops.length);
    for (const part of ["buying", "selling", "delivering"] as const) {
      expect(sw.howItWorks[part].steps).toHaveLength(en.howItWorks[part].steps.length);
    }
    expect(sw.howItWorks.questions.items).toHaveLength(en.howItWorks.questions.items.length);
  });

  it("send each question to the same place in both languages", () => {
    const hrefs = (copy: SiteCopy) => copy.howItWorks.questions.items.map((item) => item.link?.href ?? null);
    expect(hrefs(SITE_COPY.sw)).toEqual(hrefs(SITE_COPY.en));
  });

  it("leave nothing blank and nothing still in English on the Swahili side", () => {
    const english = new Set(sentences(SITE_COPY.en));
    for (const line of sentences(SITE_COPY.sw)) {
      expect(line.trim()).not.toBe("");
      expect(english.has(line)).toBe(false);
    }
  });

  // The rules `how-it-works.ts` sets for the English hold for the Swahili:
  // nothing about how long anything takes, and no mobile money network named,
  // because neither is decided or the same from one day to the next.
  it.each(LOCALES)("promise no timings and name no networks (%s)", (locale) => {
    for (const line of sentences(SITE_COPY[locale])) {
      expect(line).not.toMatch(/\b(m-?pesa|airtel|tigo|mixx|halo(pesa|tel)|vodacom|azam)/i);
      expect(line).not.toMatch(/\b\d+\s*(hours?|days?|minutes?|saa|siku|dakika)\b/i);
      expect(line).not.toMatch(/\b(saa|siku|dakika)\s+\d+/i);
      expect(line).not.toContain("—");
    }
  });

  it("tell search engines where each page is in each language", () => {
    expect(localeAlternates("en", "/how-it-works")).toEqual({
      canonical: "/en/how-it-works",
      languages: { sw: "/sw/how-it-works", en: "/en/how-it-works", "x-default": "/sw/how-it-works" },
    });
    // The home page has no trailing part to its address.
    expect(localeAlternates("sw", "/").canonical).toBe("/sw");
  });

  it("say the shops' cities in a sentence in each language", () => {
    expect(SITE_COPY.en.shops.delivering("Dodoma")).toBe("Delivering in Dodoma. Each shop delivers within its own city.");
    expect(SITE_COPY.sw.shops.delivering("Dodoma na Arusha")).toMatch(/^Tunafikisha mizigo Dodoma na Arusha\./);
  });
});
