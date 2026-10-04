/**
 * The words of the pages a signed-in customer uses -- their orders, tracking
 * a delivery -- and of signing in. English and Swahili side by side.
 *
 * The Swahili was written by Claude on 4 Oct 2026 and is the owner's to
 * correct; keep each line saying what its English neighbour says. Nothing
 * here may promise more than the Terms do.
 */
export const ACCOUNT = {
  en: {
    /** How dates are written for this language. */
    dateLocale: "en-GB",
    page: {
      title: "Your orders",
      description:
        "Orders you placed while signed in to MalFleks: pay for a confirmed order, track a delivery, or find a reference.",
      hello: (firstName: string) => `Hello, ${firstName}`,
      yourAccount: "Your account",
      heading: "Your orders",
      intro:
        "Orders you placed while signed in. You pay for each one here by mobile money, and MalFleks holds the payment until it is delivered. The reference is what you quote if you call the branch.",
      youManage: (name: string) => `You manage ${name}`,
      partnerBody: "Your listings and everything waiting on MalFleks live on your partner page.",
      openPartner: "Open your partner page",
      unavailableHeading: "We can't load your requests right now",
      unavailableBody: "This is a problem at our end, not a sign that anything was lost. Try again in a moment.",
      emptyHeading: "Nothing saved yet",
      emptyBody: "Order requests you make while signed in will be kept here, with the reference to quote to the branch.",
      browse: "Browse products",
    },
    card: {
      reference: "Your reference",
      quantity: "Quantity",
      total: "Total",
      branch: "Branch",
      deliveringTo: "Delivering to",
      track: "Track this order",
      record: "See the delivery record",
      payNow: "Pay now",
      ready: { strong: "Not paid yet.", rest: " Pay to place this order with the branch." },
      waiting: {
        strong: "Waiting for the shop to confirm the delivery cost.",
        rest: " Nothing is due yet — you'll pay here once they do.",
      },
      paid: { strong: "Paid.", rest: " MalFleks holds your payment until it is delivered." },
      delivered: {
        strong: "Delivered.",
        rest: " This order has been marked delivered. Thank you for buying through MalFleks.",
      },
      cancelled: "Cancelled.",
      reason: (reason: string) => `The reason given: ${reason}. `,
      notDelivered: "This order will not be delivered. ",
      refundDue: "Your payment will be refunded — we email you when the refund has been sent.",
      notCharged: "You have not been charged.",
    },
    cancel: {
      signedOut: "Your session has expired. Sign in again to cancel this order.",
      tooLate: "This order has changed since the page loaded. Reload to see where it stands.",
      alreadyAsked: "You have already asked us to cancel this order. We will reply by email.",
      notFound: "We couldn't find this order on your account.",
      failed: "We couldn't do that just now. Nothing was changed — try again in a moment.",
      passedOn:
        "We have passed this on. Nothing is cancelled yet — a person at MalFleks will check with the shop and email you about the order and your refund.",
      askPaid: "Ask MalFleks to cancel this paid order?",
      askUnpaid: "Cancel this order? You have not been charged for it.",
      keep: "Keep it",
      working: "Working…",
      yesAsk: "Yes, ask",
      yesCancel: "Yes, cancel",
      yesAskLabel: (reference: string) => `Yes, ask to cancel order ${reference}`,
      yesCancelLabel: (reference: string) => `Yes, cancel order ${reference}`,
      ask: "Ask to cancel",
      cancel: "Cancel this order",
      askLabel: (reference: string) => `Ask to cancel order ${reference}`,
      cancelLabel: (reference: string) => `Cancel order ${reference}`,
    },
    remove: {
      blockedUnpaid:
        "This order is confirmed and waiting for your payment, so it stays here until it is paid and delivered, or cancelled.",
      blockedUndelivered: "This order is paid and on its way, so it stays here until it is delivered.",
      after: "You can remove it after that.",
      signedOut: "Your session has expired. Sign in again to remove this request.",
      notFound: "This request has already been removed.",
      inProgress:
        "This order is confirmed and still in progress, so it can't be removed yet. Reload to see where it stands.",
      failed: "We couldn't remove this request. Nothing was changed — try again in a moment.",
      confirm: "Remove this request permanently?",
      keep: "Keep it",
      removing: "Removing…",
      yes: "Yes, remove",
      yesLabel: (reference: string) => `Yes, permanently remove request ${reference}`,
      remove: "Remove",
      removeLabel: (reference: string) => `Remove request ${reference}`,
    },
    track: {
      title: "Track your order",
      back: "Your orders",
      heading: (reference: string) => `Tracking ${reference}`,
      confirmed: { strong: "Confirmed by the branch.", rest: " Pay to complete your order." },
      payNow: "Pay now",
      status: {
        pending: "This order has not been paid for yet. Tracking starts once it is.",
        confirmed: "Order placed — tracking below updates as the delivery reports in.",
        cancelled: "This order was cancelled. Tracking has stopped.",
        fulfilled: "Delivered. This is the last position that was reported.",
      },
      statusOther: (status: string) => `Status: ${status}`,
      justNow: "just now",
      minutesAgo: (n: number) => `${n} min ago`,
      hoursAgo: (n: number) => `${n} ${n === 1 ? "hour" : "hours"} ago`,
      lastReported: (when: string) => `Last reported ${when}`,
      waitingFirst: "Waiting for the first location report.",
      noLocation: "No location has been reported for this order.",
      stalled: "Couldn't refresh tracking just now. Reload the page to try again.",
    },
    signIn: {
      title: "Sign in",
      description: "Sign in to MalFleks to order, pay by mobile money, and track your delivery.",
      eyebrow: "Order and pay safely",
      heading: "Sign in to MalFleks",
      intro:
        "Sign in to order. You pay MalFleks by mobile money, we hold your payment until the order reaches you, and you can follow the delivery from your account.",
      errorCancelled: "Sign-in was cancelled.",
      errorUnconfigured: "Signing in isn't available on this deployment yet.",
      errorFailed: "Sign-in didn't complete. Please try again.",
      actionUnconfigured: "Signing in isn't available on this deployment yet.",
      actionUnavailable: "Sign-in is unavailable right now. Please try again.",
      actionGoogle: "We couldn't reach Google. Check your connection and try again.",
      notConfigured:
        "Sign-in isn't available on this deployment — it has no Supabase authentication configuration. You can still browse every shop and product; ordering needs sign-in to be switched on.",
      browse: "Browse products",
      busy: "Signing in…",
      google: "Continue with Google",
      why: "We use your Google account to keep your orders, so you can pay for them here and track their delivery. MalFleks asks for nothing else.",
      lookAround: { before: "You don't need an account to look around. ", link: "Browse products", after: " and sign in when you are ready to order." },
    },
  },
  sw: {
    dateLocale: "sw-TZ",
    page: {
      title: "Oda zako",
      description:
        "Oda ulizoweka ukiwa umeingia MalFleks: lipia oda iliyothibitishwa, fuatilia mzigo, au pata namba ya kumbukumbu.",
      hello: (firstName: string) => `Habari, ${firstName}`,
      yourAccount: "Akaunti yako",
      heading: "Oda zako",
      intro:
        "Oda ulizoweka ukiwa umeingia. Unalipia kila moja hapa kwa pesa ya simu, na MalFleks inashikilia malipo mpaka mzigo ufike. Namba ya kumbukumbu ndiyo unayoitaja ukipiga simu tawini.",
      youManage: (name: string) => `Unasimamia ${name}`,
      partnerBody: "Bidhaa zako na kila kinachosubiri MalFleks viko kwenye ukurasa wako wa mshirika.",
      openPartner: "Fungua ukurasa wako wa mshirika",
      unavailableHeading: "Hatuwezi kupakia maombi yako kwa sasa",
      unavailableBody: "Hili ni tatizo la upande wetu, si ishara kwamba kuna kilichopotea. Jaribu tena baada ya muda mfupi.",
      emptyHeading: "Bado hakuna kilichohifadhiwa",
      emptyBody: "Maombi ya oda unayofanya ukiwa umeingia yatahifadhiwa hapa, pamoja na namba ya kumbukumbu ya kutaja tawini.",
      browse: "Tazama bidhaa",
    },
    card: {
      reference: "Namba yako ya kumbukumbu",
      quantity: "Idadi",
      total: "Jumla",
      branch: "Tawi",
      deliveringTo: "Inapelekwa kwa",
      track: "Fuatilia oda hii",
      record: "Tazama kumbukumbu ya usafirishaji",
      payNow: "Lipa sasa",
      ready: { strong: "Bado haijalipiwa.", rest: " Lipa ili oda hii ipelekwe tawini." },
      waiting: {
        strong: "Tunasubiri duka lithibitishe gharama ya usafirishaji.",
        rest: " Bado hudaiwi chochote — utalipa hapa wakishathibitisha.",
      },
      paid: { strong: "Imelipiwa.", rest: " MalFleks inashikilia malipo yako mpaka mzigo ufike." },
      delivered: {
        strong: "Umefika.",
        rest: " Oda hii imethibitishwa kuwa imefika. Asante kwa kununua kupitia MalFleks.",
      },
      cancelled: "Imeghairiwa.",
      reason: (reason: string) => `Sababu iliyotolewa: ${reason}. `,
      notDelivered: "Oda hii haitaletwa. ",
      refundDue: "Utarudishiwa malipo yako — tutakutumia barua pepe pesa ikisharudishwa.",
      notCharged: "Hujatozwa chochote.",
    },
    cancel: {
      signedOut: "Kipindi chako kimeisha. Ingia tena ili ughairi oda hii.",
      tooLate: "Oda hii imebadilika tangu ukurasa ulipofunguka. Fungua upya uone ilipofikia.",
      alreadyAsked: "Umeshatuomba kughairi oda hii. Tutakujibu kwa barua pepe.",
      notFound: "Hatukuipata oda hii kwenye akaunti yako.",
      failed: "Hatukuweza kufanya hivyo kwa sasa. Hakuna kilichobadilika — jaribu tena baada ya muda mfupi.",
      passedOn:
        "Tumelipeleka ombi lako. Bado hakuna kilichoghairiwa — mtu wa MalFleks atawasiliana na duka na kukutumia barua pepe kuhusu oda na kurudishiwa pesa yako.",
      askPaid: "Uiombe MalFleks ighairi oda hii iliyolipiwa?",
      askUnpaid: "Ughairi oda hii? Hujatozwa chochote kwa ajili yake.",
      keep: "Iache",
      working: "Inashughulikiwa…",
      yesAsk: "Ndiyo, omba",
      yesCancel: "Ndiyo, ghairi",
      yesAskLabel: (reference: string) => `Ndiyo, omba kughairi oda ${reference}`,
      yesCancelLabel: (reference: string) => `Ndiyo, ghairi oda ${reference}`,
      ask: "Omba kughairi",
      cancel: "Ghairi oda hii",
      askLabel: (reference: string) => `Omba kughairi oda ${reference}`,
      cancelLabel: (reference: string) => `Ghairi oda ${reference}`,
    },
    remove: {
      blockedUnpaid:
        "Oda hii imethibitishwa na inasubiri malipo yako, kwa hiyo inabaki hapa mpaka ilipiwe na kufika, au ighairiwe.",
      blockedUndelivered: "Oda hii imelipiwa na iko njiani, kwa hiyo inabaki hapa mpaka ifike.",
      after: "Unaweza kuiondoa baada ya hapo.",
      signedOut: "Kipindi chako kimeisha. Ingia tena ili uondoe ombi hili.",
      notFound: "Ombi hili limeshaondolewa.",
      inProgress:
        "Oda hii imethibitishwa na bado inaendelea, kwa hiyo haiwezi kuondolewa kwa sasa. Fungua upya uone ilipofikia.",
      failed: "Hatukuweza kuondoa ombi hili. Hakuna kilichobadilika — jaribu tena baada ya muda mfupi.",
      confirm: "Uondoe ombi hili kabisa?",
      keep: "Liache",
      removing: "Linaondolewa…",
      yes: "Ndiyo, ondoa",
      yesLabel: (reference: string) => `Ndiyo, ondoa kabisa ombi ${reference}`,
      remove: "Ondoa",
      removeLabel: (reference: string) => `Ondoa ombi ${reference}`,
    },
    track: {
      title: "Fuatilia oda yako",
      back: "Oda zako",
      heading: (reference: string) => `Ufuatiliaji wa ${reference}`,
      confirmed: { strong: "Tawi limethibitisha.", rest: " Lipa kukamilisha oda yako." },
      payNow: "Lipa sasa",
      status: {
        pending: "Oda hii bado haijalipiwa. Ufuatiliaji huanza ikishalipiwa.",
        confirmed: "Oda imewekwa — ufuatiliaji hapa chini hujisasisha kadri msafirishaji anavyotoa taarifa.",
        cancelled: "Oda hii ilighairiwa. Ufuatiliaji umesimama.",
        fulfilled: "Umefika. Hapa ndipo mahali pa mwisho palipotolewa taarifa.",
      },
      statusOther: (status: string) => `Hali: ${status}`,
      justNow: "sasa hivi",
      minutesAgo: (n: number) => `dakika ${n} zilizopita`,
      hoursAgo: (n: number) => (n === 1 ? "saa 1 iliyopita" : `saa ${n} zilizopita`),
      lastReported: (when: string) => `Taarifa ya mwisho: ${when}`,
      waitingFirst: "Tunasubiri taarifa ya kwanza ya mahali ulipo mzigo.",
      noLocation: "Hakuna taarifa ya mahali iliyotolewa kwa oda hii.",
      stalled: "Imeshindikana kusasisha ufuatiliaji kwa sasa. Fungua ukurasa upya ujaribu tena.",
    },
    signIn: {
      title: "Ingia",
      description: "Ingia MalFleks ili uagize, ulipe kwa pesa ya simu, na ufuatilie mzigo wako.",
      eyebrow: "Agiza na ulipe kwa usalama",
      heading: "Ingia MalFleks",
      intro:
        "Ingia ili uagize. Unalipa MalFleks kwa pesa ya simu, tunashikilia malipo yako mpaka mzigo ukufikie, na unaweza kufuatilia mzigo kwenye akaunti yako.",
      errorCancelled: "Kuingia kumeghairiwa.",
      errorUnconfigured: "Kuingia bado hakupatikani kwenye tovuti hii.",
      errorFailed: "Kuingia hakukukamilika. Tafadhali jaribu tena.",
      actionUnconfigured: "Kuingia bado hakupatikani kwenye tovuti hii.",
      actionUnavailable: "Kuingia hakupatikani kwa sasa. Tafadhali jaribu tena.",
      actionGoogle: "Hatukuweza kuifikia Google. Angalia mtandao wako kisha ujaribu tena.",
      notConfigured:
        "Kuingia hakupatikani kwenye tovuti hii — haina mipangilio ya uthibitishaji ya Supabase. Bado unaweza kutazama kila duka na bidhaa; kuagiza kunahitaji kuingia kuwashwe.",
      browse: "Tazama bidhaa",
      busy: "Unaingia…",
      google: "Endelea kwa Google",
      why: "Tunatumia akaunti yako ya Google kuhifadhi oda zako, ili uzilipie hapa na ufuatilie mizigo yake. MalFleks haiombi kingine chochote.",
      lookAround: { before: "Huhitaji akaunti ili kutazama tu. ", link: "Tazama bidhaa", after: " kisha ingia ukiwa tayari kuagiza." },
    },
  },
};

/**
 * A reason stored on an order, as shown to its customer. Most reasons are
 * typed by a person and shown as written; the one MalFleks writes itself
 * ("Cancelled by the customer", `CUSTOMER_CANCEL_NOTE`) is stored in English
 * and is shown in the reader's language.
 */
export function orderNoteLabel(note: string, locale: "en" | "sw"): string {
  return locale === "sw" && note === "Cancelled by the customer" ? "Imeghairiwa na mteja" : note;
}
