import HomeHero from "@/components/home/HomeHero";
import { HomeOpeningSoon, HomePartners, HomeProducts, HomeShops, HomeSteps } from "@/components/home/HomeSections";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";
import { serializeJsonLd } from "@/lib/product-json-ld";
import type { Locale } from "@/lib/site-copy";
import { buildSiteJsonLd } from "@/lib/site-json-ld";
import { resolveSiteUrl } from "@/lib/site-url";
import { getAllBranches, getAllBrands, getAllProducts } from "@/server/repositories";

/** Who MalFleks is, for search engines and AI assistants. Same on every render. */
function SiteStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(buildSiteJsonLd({ siteUrl: resolveSiteUrl(), contactEmail: MALFLEKS_CONTACT_EMAIL })),
      }}
    />
  );
}

/**
 * The home page, in English (`/`) or in Swahili (`/sw`).
 *
 * In order: the promise and how the money moves, what is for sale, how buying
 * works, who is selling, and the ask of a shop or courier. Every word of the
 * promise and the steps comes from `site-copy.ts`, and the products and shops
 * from the database.
 *
 * ## What this replaced, and why (4 Oct 2026)
 *
 * The home page was a dark, scroll-animated sequence of six "scenes", built
 * when its job was to impress. Three things had gone wrong with it:
 *
 * - **It was a different site.** Every other page is light; the home page
 *   alone was near-black, and the owner chose one light, calm look for all.
 * - **It was slow where it mattered.** Its content was hidden until scripts
 *   loaded and revealed it: on a phone the first screen took about five
 *   seconds to appear, on a server that answers in a tenth of one.
 * - **It led with the wrong thing.** The promise -- the reason to use
 *   MalFleks at all -- was the second scene, under a headline about shop
 *   windows and a row of counters reading "2 brands, 1 city".
 *
 * This page is plain server-rendered HTML. Nothing on it waits for a script.
 */
export default async function HomePage({ locale }: { locale: Locale }) {
  const [brands, branches, products] = await Promise.all([getAllBrands(), getAllBranches(), getAllProducts()]);

  return (
    // The site's frame (the bar at the top, the footer) is English; this
    // marks what is inside it as the language it is written in.
    <div lang={locale}>
      <SiteStructuredData />
      <HomeHero locale={locale} />
      {brands.length === 0 ? (
        <HomeOpeningSoon locale={locale} />
      ) : (
        <>
          <HomeProducts brands={brands} products={products} locale={locale} />
          <HomeSteps locale={locale} />
          <HomeShops brands={brands} branches={branches} locale={locale} />
        </>
      )}
      <HomePartners locale={locale} />
    </div>
  );
}
