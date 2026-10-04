import type { Metadata } from "next";

import HomePage from "@/components/home/HomePage";
import { sharePreview } from "@/lib/share-metadata";
import { languageAlternates, PAGE_PATHS, SITE_COPY } from "@/lib/site-copy";

const { homeMeta, ogLocale } = SITE_COPY.sw;

export const metadata: Metadata = {
  // Absolute: the Swahili title already carries the name, so the layout's
  // "… — MalFleks" pattern would say it twice.
  title: { absolute: homeMeta.title },
  description: homeMeta.description,
  alternates: languageAlternates("home"),
  ...sharePreview({ ...homeMeta, path: PAGE_PATHS.home.sw, locale: ogLocale }),
};

/**
 * The home page in Swahili.
 *
 * Most people MalFleks is for read Swahili first, and until 4 Oct 2026 the
 * site had one Swahili sentence on it. This is the same page as `/`, with the
 * same sections in the same order and the words from `site-copy.ts`. The
 * pages it links on to -- search, the order form, paying -- are still in
 * English, and the page says so.
 */
export default function SwahiliHome() {
  return <HomePage locale="sw" />;
}
