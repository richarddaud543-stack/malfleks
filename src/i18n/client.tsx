"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Locale } from "./locale";

/**
 * Which language the page is in, for components that run in the browser.
 *
 * The frame of every page (`SiteFrame`) provides it. Outside that frame --
 * in a unit test, say -- the answer is English, which is what the tests
 * written before the site had two languages expect.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
