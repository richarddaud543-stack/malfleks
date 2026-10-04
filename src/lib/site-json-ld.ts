import type { Question } from "./how-it-works";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "./site-identity";

/**
 * What MalFleks tells search engines and AI assistants about itself, in the
 * vocabulary they read (schema.org).
 *
 * Only what is true and already on the public pages: the name, the address of
 * the site, what it does, where it works, and the one contact address on the
 * contact page. No street address, phone number or registration number --
 * the business has none to publish yet, and these are added here the day it
 * does (the owner supplies them; nothing is invented).
 */
export function buildSiteJsonLd({ siteUrl, contactEmail }: { siteUrl: string; contactEmail: string }) {
  const base = siteUrl.replace(/\/+$/, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: SITE_NAME,
        url: `${base}/`,
        logo: `${base}/icon/512`,
        slogan: SITE_TAGLINE,
        description: SITE_DESCRIPTION,
        email: contactEmail,
        areaServed: { "@type": "Country", name: "Tanzania" },
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: SITE_NAME,
        url: `${base}/`,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${base}/#organization` },
        // Lets a search engine send someone straight to a search of the shop.
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** The questions page, question by question, exactly as it is written on the page. */
export function buildFaqJsonLd(questions: readonly Question[], inLanguage: string = "en") {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage,
    mainEntity: questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
