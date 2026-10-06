import Link from "next/link";

import EnglishDecides from "@/components/legal/EnglishDecides";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

/**
 * The privacy notice, in Swahili.
 *
 * A translation of the English page (`[lang]/privacy/page.tsx`), section for
 * section. **When the English changes, this must change with it** --
 * `legal-pages.test.tsx` holds the two to the same sections and date. Every
 * claim on the English page was checked against the code; this page claims
 * nothing the English one does not.
 *
 * Written by Claude on 4 Oct 2026; not checked by a lawyer or a professional
 * translator. The English version is the binding one, and the page says so.
 */
export default function PrivacySw() {
  const H = "font-display text-lg font-medium text-foreground";

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">Faragha</h1>
      <p className="mt-3 text-sm text-muted">Ilisasishwa mara ya mwisho tarehe 5 Oktoba 2026.</p>
      <EnglishDecides path="/privacy" />

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted">
        <section>
          <h2 className={H}>Tunachokusanya</h2>
          <p className="mt-2">Unapoingia kwa Google, tunahifadhi:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>jina lako na anwani yako ya barua pepe kama Google inavyotupatia</li>
            <li>picha yako ya wasifu, kama akaunti yako ya Google inayo</li>
          </ul>
          <p className="mt-3">Unapotuma ombi la oda, tunahifadhi:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>jina, namba ya simu na anwani ya kuletewa uliyoandika</li>
            <li>ulichoomba, bei yake wakati huo, tawi, na njia ya usafirishaji</li>
            <li>muda uliotuma na namba ya kumbukumbu tuliyokupa</li>
          </ul>
          <p className="mt-3">Ukiomba kuwa mshirika, tunahifadhi:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>jina la biashara yako, jina la mtu wa kuwasiliana naye, namba ya simu, mji na anwani</li>
            <li>chochote unachoandika kwenye sehemu ya maelezo</li>
          </ul>
          <p className="mt-3">
            Unapoweka oda ukiwa umeingia, tunahifadhi pia anwani ya barua pepe ya akaunti ya Google uliyotumia, ili
            tukutumie kiungo cha kulipia na risiti.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">
              Hatuoni kamwe namba yako ya siri ya pesa ya simu wala namba ya kadi yoyote.
            </strong>{" "}
            Unapolipia oda iliyothibitishwa, unafanya hivyo kwenye ukurasa unaoendeshwa na ClickPesa, mtoa huduma wetu
            wa malipo. ClickPesa hutuambia kuwa malipo yamefanikiwa, yalikuwa kiasi gani, lini, namba yake ya
            kumbukumbu ya malipo hayo, na namba ya pesa ya simu yalikotoka. Tunahifadhi kiasi, muda na namba ya
            kumbukumbu kwenye oda yako.
          </p>
        </section>

        <section>
          <h2 className={H}>Nani anaziona</h2>
          <p className="mt-2">
            Tawi unalolitumia ombi la oda huona jina, namba ya simu na anwani iliyo kwenye ombi hilo — hiyo ndiyo sababu
            ya kulituma; haliwezi kumfikishia mzigo mtu lisiloweza kumpata. Halioni maombi yako mengine, na hakuna tawi
            jingine linaloona chochote kati ya hayo. Msafirishaji anapobeba oda badala ya tawi, msafirishaji huyo huona
            mambo hayo hayo matatu kwa oda hiyo moja, kwa sababu hiyo hiyo.
          </p>
          <p className="mt-2">
            Ukurasa wa malipo unapofunguliwa kwa ajili ya oda yako, ClickPesa hupokea jina lako, namba yako ya simu na
            kiasi, ili iweze kupokea malipo.
          </p>
          <p className="mt-2">
            Wasimamizi wa MalFleks wanaweza kuona maombi ya oda na maombi ya washirika, kwa sababu mtu huyakagua.
            Mshirika huona matangazo yake mwenyewe tu na maombi yaliyotumwa kwa tawi lake mwenyewe.
          </p>
          <p className="mt-2">
            Tunapokutumia barua pepe — risiti, kiungo cha kulipia, taarifa za oda yako — ujumbe hutumwa kupitia Brevo,
            huduma ya barua pepe, ambayo kwa hiyo hushughulikia anwani yako ya barua pepe na maandishi ya ujumbe huo.
            Google hushughulikia kuingia kwako; hutuambia jina lako, anwani ya barua pepe na picha ya wasifu, na si
            kingine chochote.
          </p>
          <p className="mt-2">
            Tunapokutumia kwa ujumbe mfupi namba ya kupokea mzigo ya oda uliyoilipia, ujumbe hutumwa kupitia Beem,
            huduma ya ujumbe mfupi, ambayo kwa hiyo hushughulikia namba yako ya simu na maandishi ya ujumbe huo.
            MalFleks inapolilipa tawi au msafirishaji, ClickPesa hupokea namba ya pesa ya simu ya mshirika huyo na
            kiasi.
          </p>
          <p className="mt-2">
            Tunahesabu matembezi kwa Vercel Web Analytics, ili tuone kurasa zipi zinatumika na kwa aina gani ya kifaa.
            Hurekodi ukurasa, muda, nchi na mji, na aina ya kivinjari na kifaa. Haiweki vidakuzi (cookies), hairekodi
            jina lako wala anwani yako ya barua pepe, na haikufuati kwenye tovuti nyingine. Namba za kumbukumbu za oda
            huondolewa kwenye anwani za kurasa kabla hazijahesabiwa.
          </p>
          <p className="mt-2">
            Hatuuzi taarifa zako, na hatuzipeleki kwa watangazaji. Hakuna matangazo ya biashara kwenye MalFleks.
          </p>
        </section>

        <section>
          <h2 className={H}>Zinahifadhiwa wapi</h2>
          <p className="mt-2">
            Kwenye hifadhidata ya Postgres inayohifadhiwa na Supabase nchini Ireland (eneo lao la eu-west-1), na tovuti
            yenyewe inaendeshwa kwenye Vercel. Maana yake ni kwamba taarifa zako zinahifadhiwa nje ya Tanzania. Kuingia
            hushughulikiwa na Supabase Auth kwa kutumia akaunti yako ya Google; hatuoni wala kuhifadhi kamwe nenosiri
            lako la Google.
          </p>
        </section>

        <section>
          <h2 className={H}>Tunazihifadhi kwa muda gani</h2>
          <p className="mt-2">
            Maombi ya oda huhifadhiwa kadri yanavyokufaa wewe na tawi — unaweza kuona yako kwenye ukurasa wa akaunti
            yako, na namba ya kumbukumbu uliyoitaja mwezi uliopita inapaswa bado kuwa na maana. Bado hatujaweka muda wa
            kufuta kiotomatiki, na badala ya kubuni mmoja hapa tunasema hivyo wazi, na tutafuta chochote
            utakachotuomba.
          </p>
        </section>

        <section>
          <h2 className={H}>Jinsi ya kuomba zifutwe</h2>
          <p className="mt-2">
            Andika kwa{" "}
            <a href={`mailto:${MALFLEKS_CONTACT_EMAIL}`} className="text-accent underline decoration-border underline-offset-4">
              {MALFLEKS_CONTACT_EMAIL}
            </a>{" "}
            ukitumia anwani uliyoingia nayo na useme unachotaka kiondolewe — ombi moja la oda, au akaunti yako na kila
            kilichoambatana nayo. Tutafanya hivyo na kukuambia ikishakamilika.
          </p>
          <p className="mt-2">
            Kuna kikomo kimoja tunachopaswa kukisema wazi: tawi ambalo tayari limepokea ombi lako lina namba yako ya
            simu kwenye kumbukumbu zake lenyewe, na hatuwezi kukufutia hiyo. Tunaweza kukuambia lilikwenda kwa nani.
          </p>
        </section>

        <section>
          <h2 className={H}>Vidakuzi (cookies)</h2>
          <p className="mt-2">
            MalFleks huweka vidakuzi kwa madhumuni mawili: kukuweka ukiwa umeingia, na kukumbuka lugha uliyochagua.
            Hakuna vidakuzi vya matangazo wala vya kukufuatilia — kuhesabu matembezi kulikoelezwa hapo juu hakutumii
            chochote — na ndiyo sababu tovuti hii haina bango la vidakuzi linalokuomba ukubali chochote.
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted">
        Soma pia{" "}
        <Link href="/terms" className="text-accent underline decoration-border underline-offset-4">
          masharti yetu ya matumizi
        </Link>
        .
      </p>
    </div>
  );
}
