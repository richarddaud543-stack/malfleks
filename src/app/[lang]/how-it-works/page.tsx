import type { Metadata } from "next";

import HowItWorksContent from "@/components/how-it-works/HowItWorksContent";
import { localeAlternates, OG_LOCALE } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import { sharePreview } from "@/lib/share-metadata";
import { SITE_COPY } from "@/lib/site-copy";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const page = SITE_COPY[locale].howItWorks;
  return {
    title: page.title,
    description: page.description,
    alternates: localeAlternates(locale, "/how-it-works"),
    ...sharePreview({
      title: page.shareTitle,
      description: page.description,
      path: "/how-it-works",
      locale: OG_LOCALE[locale],
    }),
  };
}

/** "How MalFleks works", in the language of its address. The page itself is `HowItWorksContent`. */
export default async function HowItWorksPage({ params }: Props) {
  return <HowItWorksContent locale={await pageLocale(params)} />;
}
