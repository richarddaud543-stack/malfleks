import type { Metadata } from "next";

import HomePage from "@/components/home/HomePage";
import { localeAlternates, OG_LOCALE } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import { sharePreview } from "@/lib/share-metadata";
import { SITE_COPY } from "@/lib/site-copy";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { homeMeta } = SITE_COPY[locale];
  return {
    // Absolute: the title already carries the name, so the layout's
    // "… — MalFleks" pattern would say it twice.
    title: { absolute: homeMeta.title },
    description: homeMeta.description,
    alternates: localeAlternates(locale, "/"),
    ...sharePreview({ ...homeMeta, path: "/", locale: OG_LOCALE[locale] }),
  };
}

/** The home page, in the language of its address. The page itself is `HomePage`. */
export default async function Home({ params }: Props) {
  return <HomePage locale={await pageLocale(params)} />;
}
