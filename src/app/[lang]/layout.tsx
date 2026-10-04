import type { Metadata } from "next";
import type { ReactNode } from "react";

import SiteFrame from "@/components/layout/SiteFrame";
import { LOCALES, OG_LOCALE } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import { SITE_COPY } from "@/lib/site-copy";
import { SITE_NAME } from "@/lib/site-identity";

/** Both languages of every page are built ahead of time. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

/**
 * What a page in this language says about itself unless it says something
 * more specific: the description and the share text, in the page's language.
 * The root layout's are English and remain what the admin console uses.
 */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { title, description } = SITE_COPY[locale].homeMeta;
  return {
    title: { default: title, template: `%s — ${SITE_NAME}` },
    description,
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url: "./", locale: OG_LOCALE[locale] },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Everything the public sees, once per language: `/sw/…` and `/en/…`.
 *
 * Visitors use the plain addresses (`/search`); `src/proxy.ts` serves the
 * version for the language they chose. See `src/i18n/locale.ts`.
 */
export default async function LanguageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const locale = await pageLocale(params);
  return <SiteFrame locale={locale}>{children}</SiteFrame>;
}
