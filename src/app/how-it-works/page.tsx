import type { Metadata } from "next";

import HowItWorksContent from "@/components/how-it-works/HowItWorksContent";
import { sharePreview } from "@/lib/share-metadata";
import { languageAlternates, PAGE_PATHS, SITE_COPY } from "@/lib/site-copy";

const { howItWorks: page, ogLocale } = SITE_COPY.en;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: languageAlternates("howItWorks"),
  ...sharePreview({
    title: page.shareTitle,
    description: page.description,
    path: PAGE_PATHS.howItWorks.en,
    locale: ogLocale,
  }),
};

/** "How MalFleks works" in English. The page itself is `HowItWorksContent`. */
export default function HowItWorksPage() {
  return <HowItWorksContent locale="en" />;
}
