import type { ReportReason } from "@/lib/listing-report";

/**
 * The words of "Report this listing", English and Swahili side by side.
 *
 * Nothing here may promise more than the Terms ("Reporting a listing") do: a
 * person reads every report and may hide the listing while checking -- no
 * response time, no guaranteed outcome. The Swahili was written by Claude on
 * 12 Oct 2026 and is the owner's to correct.
 */
export const REPORT = {
  en: {
    link: "Report this listing",
    title: "Report a listing",
    titleFor: (product: string) => `Report ${product}`,
    heading: "Report this listing",
    intro: (product: string, brand: string) =>
      `Tell us what is wrong with “${product}” from ${brand}. A person at MalFleks reads every report, and may hide the listing while we check.`,
    reasonLegend: "What is wrong?",
    reasons: {
      rights: "It uses my photo, my brand or my work without permission",
      fake: "It is fake or counterfeit",
      unsafe: "It is unsafe, or not allowed to be sold",
      wrong: "The price, details or location are wrong",
      other: "Something else",
    } satisfies Record<ReportReason, string>,
    details: "Details",
    detailsHint:
      "What is wrong, and how you know. If it is your own photo or work, say so and where the original is.",
    errors: {
      reason: "Choose what is wrong.",
      detailsMissing: "Tell us what is wrong.",
      detailsShort: "Add a little more so we can check it.",
      detailsLong: (max: number) => `Keep it under ${max} characters. Email us if you need to send more.`,
    },
    send: "Send report",
    sending: "Sending…",
    signIn: "Sign in to report",
    signedOutNote: (email: string) =>
      `Reports need an account so we can reply and so the form cannot be misused. You can also email ${email} with a link to the listing.`,
    sent: "Thank you. Your report has reached MalFleks, and a person will look at it. We may email you at the address you signed in with.",
    failed: {
      "rate-limited": "You have sent several reports already today. Email us if there is more.",
      "already-reported": "You have already reported this listing. We have it and will look at it.",
      "not-found": "This listing no longer exists.",
      invalid: "Check the form and try again.",
      "signed-out": "Your session has expired. Sign in again to send this report.",
      unavailable: "We couldn't send that just now. Try again in a moment, or email us.",
    },
    back: "Back to the listing",
    terms: "How we handle reports",
  },
  sw: {
    link: "Ripoti tangazo hili",
    title: "Ripoti tangazo",
    titleFor: (product: string) => `Ripoti ${product}`,
    heading: "Ripoti tangazo hili",
    intro: (product: string, brand: string) =>
      `Tuambie kosa la “${product}” kutoka ${brand}. Mtu wa MalFleks husoma kila ripoti, na anaweza kulificha tangazo tunapochunguza.`,
    reasonLegend: "Kosa ni nini?",
    reasons: {
      rights: "Linatumia picha yangu, chapa yangu au kazi yangu bila ruhusa",
      fake: "Ni feki au ya kughushi",
      unsafe: "Ni hatari, au hairuhusiwi kuuzwa",
      wrong: "Bei, maelezo au mahali si sahihi",
      other: "Jambo jingine",
    } satisfies Record<ReportReason, string>,
    details: "Maelezo",
    detailsHint:
      "Kosa ni nini, na unajuaje. Kama ni picha au kazi yako mwenyewe, sema hivyo na ya asili iko wapi.",
    errors: {
      reason: "Chagua kosa ni nini.",
      detailsMissing: "Tuambie kosa ni nini.",
      detailsShort: "Ongeza kidogo zaidi ili tuweze kuchunguza.",
      detailsLong: (max: number) => `Isizidi herufi ${max}. Tutumie barua pepe kama unahitaji kutuma zaidi.`,
    },
    send: "Tuma ripoti",
    sending: "Inatumwa…",
    signIn: "Ingia ili uripoti",
    signedOutNote: (email: string) =>
      `Ripoti zinahitaji akaunti ili tuweze kukujibu na fomu isitumiwe vibaya. Unaweza pia kutuma barua pepe kwa ${email} yenye kiungo cha tangazo.`,
    sent: "Asante. Ripoti yako imefika MalFleks, na mtu ataiangalia. Tunaweza kukutumia barua pepe kwenye anwani uliyoingia nayo.",
    failed: {
      "rate-limited": "Umeshatuma ripoti kadhaa leo. Tutumie barua pepe kama kuna zaidi.",
      "already-reported": "Umeshaliripoti tangazo hili. Tumelipokea na tutaliangalia.",
      "not-found": "Tangazo hili halipo tena.",
      invalid: "Kagua fomu na ujaribu tena.",
      "signed-out": "Kipindi chako kimeisha. Ingia tena ili utume ripoti hii.",
      unavailable: "Hatukuweza kuituma sasa hivi. Jaribu tena baada ya muda mfupi, au tutumie barua pepe.",
    },
    back: "Rudi kwenye tangazo",
    terms: "Jinsi tunavyoshughulikia ripoti",
  },
};

export type ReportFailure = keyof (typeof REPORT)["en"]["failed"];
