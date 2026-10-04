import type { ReactNode } from "react";

import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import RememberLandingLanguage from "@/components/layout/RememberLandingLanguage";
import { LocaleProvider } from "@/i18n/client";
import { CHROME } from "@/i18n/copy/chrome";
import type { Locale } from "@/i18n/locale";

/**
 * The frame of every shop page, in one language: the skip link, the bar at
 * the top, the page, the footer.
 *
 * It lived in the root layout until the site had two languages. The root
 * layout cannot know which language a page is in -- it sits above the part
 * of the address that says so -- so the frame moved here, and the layout for
 * each language draws it. The admin console draws it too, in English, for the
 * one case where it shows a shop page: the "not found" it gives a visitor who
 * is not an admin, which must look like every other "not found" on the site.
 *
 * `lang` on the wrapper is what tells a screen reader which voice to use; the
 * script sets the same on the document itself, before anything is read.
 */
export default function SiteFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <LocaleProvider locale={locale}>
      <div lang={locale} className="flex min-h-full flex-1 flex-col">
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(locale)}` }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
        >
          {CHROME[locale].skip}
        </a>
        <Navbar />
        {/* tabIndex={-1} is what makes the skip link actually skip: without a
            focusable target the browser scrolls but leaves focus on <body>,
            so the next Tab returns to the nav the user just skipped. */}
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <Footer locale={locale} />
        <RememberLandingLanguage />
      </div>
    </LocaleProvider>
  );
}
