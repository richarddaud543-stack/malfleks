import Link from "next/link";

/**
 * The line at the top of a legal page shown in Swahili.
 *
 * The owner's decision of 4 Oct 2026: the Terms and the Privacy notice are
 * translated so they can be read, and the English text is the one that
 * decides if the two ever differ. The English was written first and is the
 * one a lawyer will be asked to check; the Swahili is Claude's translation
 * of it and has been checked by nobody qualified. Saying so here is what
 * keeps the translation honest.
 *
 * `path` is the page's plain address; the link names the English version
 * outright, so it opens in English whatever language the reader has chosen.
 */
export default function EnglishDecides({ path }: { path: string }) {
  return (
    <p className="mt-6 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted" data-testid="english-decides">
      Hii ni tafsiri ya Kiswahili ili isomeke kwa urahisi. Toleo la Kiingereza ndilo linalotumika rasmi: pale tafsiri hii
      inapotofautiana nalo, toleo la Kiingereza ndilo linaloamua.{" "}
      <Link href={`/en${path}`} hrefLang="en" prefetch={false} className="text-accent underline decoration-border underline-offset-4">
        Soma toleo la Kiingereza
      </Link>
      .
    </p>
  );
}
