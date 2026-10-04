import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, isLocale, localeAlternates, localePath, LOCALES, otherLocale, splitLocale } from "./locale";

describe("the two languages", () => {
  it("are Swahili and English, and a visitor who has not chosen gets Swahili", () => {
    expect([...LOCALES].sort()).toEqual(["en", "sw"]);
    expect(DEFAULT_LOCALE).toBe("sw");
    expect(isLocale("sw")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(otherLocale("sw")).toBe("en");
  });

  it("reads the language out of an address, and leaves a plain address alone", () => {
    expect(splitLocale("/sw/search")).toEqual({ locale: "sw", path: "/search" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/search")).toEqual({ locale: null, path: "/search" });
    // A page whose name merely starts with a language's letters is not in it.
    expect(splitLocale("/english-lessons")).toEqual({ locale: null, path: "/english-lessons" });
    expect(splitLocale("/swahili")).toEqual({ locale: null, path: "/swahili" });
  });

  it("builds the address of a page in a language", () => {
    expect(localePath("sw", "/")).toBe("/sw");
    expect(localePath("en", "/products/x")).toBe("/en/products/x");
  });

  it("tells search engines where a page is in each language", () => {
    expect(localeAlternates("en", "/search")).toEqual({
      canonical: "/en/search",
      languages: { sw: "/sw/search", en: "/en/search", "x-default": "/sw/search" },
    });
  });
});
