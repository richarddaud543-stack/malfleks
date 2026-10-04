import type { Metadata } from "next";

import HowItWorksContent from "@/components/how-it-works/HowItWorksContent";
import { sharePreview } from "@/lib/share-metadata";
import { languageAlternates, PAGE_PATHS, SITE_COPY } from "@/lib/site-copy";

const { howItWorks: page, ogLocale } = SITE_COPY.sw;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: languageAlternates("howItWorks"),
  ...sharePreview({
    title: page.shareTitle,
    description: page.description,
    path: PAGE_PATHS.howItWorks.sw,
    locale: ogLocale,
  }),
};

/** "How MalFleks works" in Swahili: the same page as `/how-it-works`, question for question. */
export default function SwahiliHowItWorksPage() {
  return <HowItWorksContent locale="sw" />;
}
