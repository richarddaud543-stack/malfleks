import Link from "next/link";

import EnglishDecides from "@/components/legal/EnglishDecides";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

/**
 * The Terms of use, in Swahili.
 *
 * A translation of the English page (`[lang]/terms/page.tsx`), section for
 * section and paragraph for paragraph. **When the English changes, this must
 * change with it** -- `legal-pages.test.tsx` holds the two to the same
 * sections and the same "last updated" date so one cannot move alone.
 *
 * Written by Claude on 4 Oct 2026; not checked by a lawyer or a professional
 * translator. The English version is the binding one, and the page says so.
 */
export default function TermsSw() {
  const H = "font-display text-lg font-medium text-foreground";

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">Masharti ya matumizi</h1>
      <p className="mt-3 text-sm text-muted">Yalisasishwa mara ya mwisho tarehe 4 Oktoba 2026.</p>
      <EnglishDecides path="/terms" />

      <div className="prose-malfleks mt-10 space-y-8 text-sm leading-relaxed text-muted">
        <section>
          <h2 className={H}>MalFleks ni nini</h2>
          <p className="mt-2">
            MalFleks huorodhesha maduka na matawi yaliyopo Tanzania na kuonyesha kila moja linauza nini, liko wapi, na
            bidhaa zingekufikiaje — kwa usafirishaji wa tawi lenyewe au kwa msafirishaji wa mjini. Unapotuma ombi la
            oda, MalFleks hulipatia tawi hilo jina lako, namba yako ya simu na anwani ya kuletewa, na hukupa namba ya
            kumbukumbu ya kutaja.
          </p>
          <p className="mt-2">
            MalFleks <strong>si muuzaji</strong> na haina bidhaa. Bidhaa huuzwa na tawi, kwa bei iliyowekwa na tawi.
            Tawi lisipokuwa na kile lilichoorodhesha, au bei ikiwa imebadilika, tunataka kujua, kwa sababu tawi
            linaloendelea kufanya hivyo halistahili kuwa hapa.
          </p>
          <p className="mt-2">
            Oda huwekwa kwa tawi ukishailipia kwenye MalFleks. Kabla ya hapo hakuna kinachotengwa na hakuna
            unachodaiwa.
          </p>
        </section>

        <section id="paying" className="scroll-mt-28">
          <h2 className={H}>Malipo</h2>
          <p className="mt-2">
            Unapoweka oda ukiwa umeingia, ukurasa wa malipo wa oda hiyo hufunguka kwenye MalFleks papo hapo. Unalipa
            kiasi chote kinachoonyeshwa hapo — bidhaa na, pale msafirishaji anapotumika, ada ya usafirishaji — kwa pesa
            ya simu kupitia ClickPesa, mtoa huduma wetu wa malipo. Oda yako huwekwa kwa tawi ukishalipa; oda
            usiyoilipia haipelekwi tawini na hudaiwi chochote kwa ajili yake. Pale oda isipoweza kuwekewa bei
            unapoiweka, tawi huithibitisha kwanza na ukurasa wa malipo hufunguka baada ya hapo.
          </p>
          <p className="mt-2">
            <strong>Unalipa MalFleks, na MalFleks inashikilia malipo yako</strong> mpaka oda ifike. Kisha tunalilipa
            tawi na msafirishaji sehemu zao na kubaki na ada ya huduma, ambayo tayari imo ndani ya kiasi
            ulichoonyeshwa: hutozwi chochote cha ziada juu yake. Kama ulilipa kupitia MalFleks, usililipe tena tawi
            wala msafirishaji mlangoni.
          </p>
          <p className="mt-2">
            Tawi au MalFleks ikighairi oda uliyoilipia — kwa mfano kwa sababu tawi limebainika kutokuwa na bidhaa hiyo
            — unarudishiwa kiasi chote.
          </p>
          <p className="mt-2">
            Oda ambayo hujailipia unaweza kuighairi mwenyewe, kwenye{" "}
            <Link href="/account" className="text-accent underline underline-offset-4">
              Oda zako
            </Link>
            ; hutozwi chochote. Ukitaka kughairi oda uliyokwisha kuilipia, bonyeza “Omba kughairi” hapo mapema
            iwezekanavyo, kabla haijatumwa. Mtu wa MalFleks atawasiliana na tawi na kukutumia barua pepe kuhusu
            kinachoitokea oda na malipo yako.
          </p>
          <p className="mt-2">
            Kuagiza kunahitaji akaunti. Hakuna unachoandika kwenye fomu ya oda kinachotumwa kwa MalFleks wala kwa tawi
            mpaka uwe umeingia na kuendelea kwenye malipo.
          </p>
        </section>

        <section>
          <h2 className={H}>Akaunti yako</h2>
          <p className="mt-2">
            Unaingia kwa Google. Akaunti ndiyo inayoiwezesha MalFleks kuhifadhi oda yako, kukufungulia ukurasa wake wa
            malipo, kukutumia risiti kwa barua pepe na kukuonyesha mzigo ulipofika. Kutazama tu hakuhitaji akaunti.
          </p>
          <p className="mt-2">
            Tumia namba ya simu na anwani unayoweza kupatikana kweli. Ombi lenye taarifa zisizofika popote hupoteza
            muda wa mtu halisi.
          </p>
        </section>

        <section>
          <h2 className={H}>Washirika</h2>
          <p className="mt-2">
            Biashara huomba kuorodheshwa na mtu wa MalFleks hukagua kila ombi kwa mkono. Kukubaliwa si kwa kiotomatiki,
            na kukubaliwa hakuliweki tawi kwenye ramani — hiyo ni hatua tofauti, inayochukuliwa tukishathibitisha
            anwani na biashara husika.
          </p>
          <p className="mt-2">
            Bidhaa anazotuma mshirika hukaguliwa kabla hazijaonekana. Washirika wanawajibika kuhakikisha matangazo yao
            ni sahihi, na kuheshimu bei waliyoweka. Tunaondoa matangazo, na washirika, wasiofanya hivyo.
          </p>
        </section>

        <section>
          <h2 className={H}>Majina na nembo za chapa</h2>
          <p className="mt-2">
            Majina na nembo za chapa zinazoonyeshwa kwenye MalFleks ni alama za biashara za wamiliki wake na hutumika
            kutambulisha maduka yanayouza bidhaa hizo. Kuonekana kwake hapa si dai la kuidhinishwa wala ushirikiano
            zaidi ya kile tangazo linachosema.
          </p>
        </section>

        <section>
          <h2 className={H}>Mabadiliko na mawasiliano</h2>
          <p className="mt-2">
            MalFleks ni mpya na masharti haya yatabadilika kadri inavyokua. Tarehe iliyo juu inaonyesha yalibadilika
            lini mara ya mwisho. Maswali, malalamiko na maombi ya kuondoa kitu yatumwe kwa{" "}
            <a href={`mailto:${MALFLEKS_CONTACT_EMAIL}`} className="text-accent underline decoration-border underline-offset-4">
              {MALFLEKS_CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted">
        Soma pia{" "}
        <Link href="/privacy" className="text-accent underline decoration-border underline-offset-4">
          taarifa yetu ya faragha
        </Link>
        .
      </p>
    </div>
  );
}
