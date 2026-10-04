import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CHROME } from "@/i18n/copy/chrome";

import { pageLocale } from "@/i18n/server";

/**
 * Any address that is not a page. Without this, an unknown address would be
 * answered from above the language layout -- a "not found" with no bar at the
 * top, no footer and no language. Here it is answered inside it.
 */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: CHROME[lang === "en" ? "en" : "sw"].notFound.title };
}

export default async function UnknownPage({ params }: { params: Promise<{ lang: string }> }) {
  await pageLocale(params);
  notFound();
}
