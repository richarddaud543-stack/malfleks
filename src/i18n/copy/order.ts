/**
 * The words of ordering and paying: the order form and its rules, the
 * confirmation screen, and the pay page. English and Swahili side by side.
 *
 * Sentences that carry a link are split into the words before it, the link's
 * own words, and the words after -- so the two languages can put the link
 * where their grammar wants it.
 *
 * The Swahili was written by Claude on 4 Oct 2026 and is the owner's to
 * correct. Nothing here may promise more than the Terms do: no refund timing,
 * no delivery timing, no network names.
 */
export const ORDER = {
  en: {
    errors: {
      cityMissing: "Say which city this is going to.",
      cityOutside: (city: string) => `This shop only delivers within ${city}.`,
      quantityMissing: "Enter how many you want.",
      quantityWhole: "Quantity must be a whole number.",
      quantityMin: "Quantity must be at least 1.",
      quantityMax: (max: number) => `For more than ${max} units, contact the branch directly.`,
      belowMinimum: (minimum: string) => `MalFleks orders start at ${minimum}. Add more to reach the minimum.`,
      name: "Enter the name the driver should ask for.",
      phoneMissing: "Enter a phone number we can reach you on.",
      phoneInvalid: "Enter a Tanzanian mobile number, e.g. 0754 123 456.",
      address: "Enter a street and area so the driver can find you.",
      agent: "Select an agent to carry this order.",
      adult: "Confirm that you are 18 or older to order.",
    },
    page: {
      title: "Delivery",
      titleFor: (product: string) => `Delivery for ${product}`,
      heading: "Delivery for your order",
      from: (branch: string) => `from ${branch}`,
      brandHeading: (brand: string) => `${brand} delivers this order directly`,
      brandBody: (branch: string, brand: string) =>
        `${branch} runs its own delivery service. Once you confirm, ${brand} will handle pickup and drop-off — no third-party courier needed.`,
      agentHeading: (branch: string) => `${branch} doesn't deliver directly`,
      agentBody: (city: string) => `Choose a local delivery agent serving ${city} to complete your order.`,
      blocked: "This can't be ordered right now",
      similar: "Find something similar",
    },
    form: {
      chooseAgent: "Choose a delivery agent",
      chooseAgentBody: (branch: string, city: string) =>
        `${branch} doesn't deliver, so a local agent serving ${city} will carry this order.`,
      details: "Your details",
      quantity: "Quantity",
      fullName: "Full name",
      phone: "Phone number",
      phoneHint: "A Tanzanian mobile number, e.g. 0754 123 456.",
      city: "Delivery city",
      cityHint: (city: string) => `This shop delivers within ${city}.`,
      choose: "Choose…",
      elsewhere: "Somewhere else",
      outside: (city: string) => `This shop can't deliver outside ${city}.`,
      findShop: "Find a shop in your city",
      address: "Delivery address",
      addressHint: "Street, area and any landmark that helps the driver.",
      fix: (n: number) => `${n} ${n === 1 ? "detail needs" : "details need"} fixing before you can order.`,
      opening: "Opening payment…",
      toPayment: "Continue to payment",
      signIn: "Sign in to order",
      // Electronic Transactions Act s.30 and the Age of Majority Act: see the Terms.
      adult: {
        before: "I am 18 or older and I accept the ",
        link: "terms of use",
        after: ", including the 7-day right to return goods.",
      },
      noteSignedIn:
        "Next you pay by mobile money. MalFleks holds your payment until the order is delivered; if the branch can't supply it, you are refunded in full.",
      noteSignedOut:
        "Ordering needs an account, so MalFleks can take your payment and hold it until delivery. Nothing is sent or charged yet — what you typed is kept in this tab and will be here when you come back from signing in.",
    },
    agent: {
      verified: "Verified",
      based: (city: string, regions: string) => `Based in ${city} · Serves ${regions}`,
      eta: (when: string) => `ETA: ${when}`,
    },
    summary: {
      heading: "Order summary",
      item: "Item",
      unitPrice: "Unit price",
      quantity: "Quantity",
      from: "From",
      delivery: "Delivery",
      notChosen: "Not chosen yet",
      total: "Line total",
      branchDelivers: "The branch delivers this itself.",
      feeAdded: "The courier's delivery fee is added at checkout.",
      nothingAtDoor: "You pay the full amount to MalFleks, so there is nothing to pay at the door.",
    },
    confirmation: {
      title: "Order request received",
      description: "Your order request reference and what happens next.",
      loading: "Loading your request…",
      noneHeading: "No order request to show",
      noneBody:
        "A request made without signing in is held in this browser tab only — a different tab, or a session that has since closed, won't have it. Nothing was sent anywhere.",
      noneAccount: { before: "If you were signed in when you made it, it will be on ", link: "your account", after: "." },
      browse: "Browse products",
      eyebrow: "Request ready",
      heading: (product: string) => `Your request for ${product}`,
      reference: "Your reference",
      quote: (brandDelivered: boolean) =>
        `Quote this when you contact ${brandDelivered ? "the branch" : "the branch or the agent"}.`,
      saved: "Saved to your account.",
      findAgain: { link: "Find it again", after: " any time — closing this tab won't lose it. " },
      track: { link: "Track it", after: " once it is paid." },
      tabOnly: {
        before: "This request lives in this browser tab only, so write the reference down or ",
        link: "sign in",
        after: " to have the next one kept for you.",
      },
      next: "What happens next",
      step1Saved: {
        before: "Nothing has been paid yet. Your order is saved with MalFleks. ",
        link: "Open your checkout page",
        after: (branch: string) =>
          ` to pay for it. If it says the branch has to confirm first, ${branch} has been asked and we email you as soon as it can be paid.`,
      },
      step1Unsaved: (branch: string, brandDelivered: boolean) =>
        `Nothing has been paid and nothing has been reserved. Because you weren't signed in, this request has not been sent to MalFleks or to ${branch} — it exists in this browser tab only. Use the reference above when you contact ${brandDelivered ? "the branch" : "the branch or the agent"} yourself.`,
      step2Brand: (branch: string, brand: string) =>
        `${branch} runs its own delivery, so ${brand} will handle pickup and drop-off. `,
      step2BrandCall: (phone: string) => `Call the branch on ${phone} to confirm stock and agree a delivery time.`,
      step2BrandNoPhone: {
        before: (city: string) =>
          `We don't have a published number for this branch, so take your reference to the counter in ${city} to confirm stock and agree a delivery time — its `,
        link: "address and opening hours",
        after: " are on the branch page.",
      },
      step2Agent: (branch: string, carrier: string, city: string) =>
        `${branch} doesn't deliver, so ${carrier} — a local agent serving ${city} — carries this order. `,
      step2AgentCall: (phone: string) => `Call them on ${phone} to arrange collection from the branch.`,
      step2AgentNoPhone: {
        before: "Their number is on the ",
        link: "delivery agents page",
        after: "; call them to arrange collection from the branch.",
      },
      step3Saved: {
        before: "You pay on MalFleks by mobile money on ",
        link: "your checkout page",
        after: ". MalFleks holds your payment until the order is delivered, and refunds you in full if the branch can't supply it.",
      },
      step3Unsaved: (brandDelivered: boolean) =>
        `Payment and delivery charges are agreed directly with ${brandDelivered ? "the branch" : "the branch and the agent"}. Because you weren't signed in, MalFleks has no record of this request and takes no payment for it.`,
      where: "Where it's going",
      name: "Name",
      phone: "Phone",
      address: "Address",
      back: (product: string) => `Back to ${product}`,
      keepBrowsing: "Keep browsing",
    },
    pay: {
      title: "Pay for your order",
      back: "Your orders",
      headingPaid: "Payment received",
      heading: "Pay for your order",
      footnote: {
        before:
          "You pay MalFleks, not the branch. We hold your payment until the order is delivered, then pay the branch and the courier. If the branch can't supply the order or it can't be delivered, you are refunded in full. See the ",
        link: "terms",
        after: ".",
      },
      waitingHeading: "Waiting for the branch",
      waitingBody: (branch: string) =>
        `This order needs ${branch} to confirm the price and delivery before it can be paid for. Nothing is due yet — this page opens for payment as soon as they do, and we'll email you too. You can leave it open; it updates on its own.`,
      readyConfirmed: "Confirmed — ready to pay",
      readyNew: "Pay to place your order",
      readyConfirmedBody: (branch: string) =>
        `${branch} has it in stock at this price. Pay by mobile money to complete your order.`,
      readyNewBody: (branch: string) =>
        `Pay by mobile money and your order goes to ${branch} straight away. If they can't supply it, you are refunded in full.`,
      payAmount: (amount: string) => `Pay ${amount}`,
      opens:
        "Opens ClickPesa's secure payment page in a new tab. You choose your mobile money network there and approve the payment on your phone. MalFleks never sees your PIN.",
      lastFailed: "Your last attempt didn't go through, and nothing was taken. You can try again with the same button.",
      paidAlready: "Paid already?",
      paidAlreadyBody: "It usually shows here within a minute. If it hasn't, ask ClickPesa now.",
      checking: "Checking…",
      checkNow: "I've paid — check now",
      notYet:
        "Not received yet. If your phone showed the payment as successful, give it a minute and check again — you won't be charged twice for pressing this.",
      paidHeading: "Paid — thank you",
      received: (amount: string) => `We've received ${amount}. `,
      receivedPlain: "We've received your payment. ",
      paidBody: (branch: string) =>
        `${branch} has been told to deliver your order, and MalFleks holds your payment until it arrives.`,
      paymentReference: "Payment reference",
      track: "Track your delivery",
      cancelledHeading: "This order was cancelled",
      reasonGiven: (reason: string) => `Reason given: ${reason}. `,
      nothingDue: "Nothing is due.",
      browse: "Browse products",
      unavailableHeading: "Payment isn't open for this order yet",
      unavailable: {
        before:
          "Your order is saved, but we couldn't open the payment page just now. Nothing has been charged. Try again in a few minutes, or ",
        link: "contact us",
        after: " with your reference.",
      },
      summaryLabel: "Order summary",
      yourOrder: "Your order",
      delivery: (carrier: string) => `Delivery (${carrier})`,
      total: "Total",
      from: "From",
      deliveredBy: "Delivered by",
      yourNumber: "Your number",
    },
  },
  sw: {
    errors: {
      cityMissing: "Taja mzigo huu unakwenda mji gani.",
      cityOutside: (city: string) => `Duka hili hufikisha mizigo ndani ya ${city} tu.`,
      quantityMissing: "Andika unataka ngapi.",
      quantityWhole: "Idadi lazima iwe namba kamili.",
      quantityMin: "Idadi lazima iwe angalau 1.",
      quantityMax: (max: number) => `Kwa zaidi ya ${max}, wasiliana na tawi moja kwa moja.`,
      belowMinimum: (minimum: string) => `Oda za MalFleks huanzia ${minimum}. Ongeza idadi ufikie kiwango cha chini.`,
      name: "Andika jina ambalo dereva ataliulizia.",
      phoneMissing: "Andika namba ya simu tunayoweza kukupata.",
      phoneInvalid: "Andika namba ya simu ya Tanzania, mfano 0754 123 456.",
      address: "Andika mtaa na eneo ili dereva akupate.",
      agent: "Chagua msafirishaji wa kubeba oda hii.",
      adult: "Thibitisha kuwa una umri wa miaka 18 au zaidi ili uagize.",
    },
    page: {
      title: "Usafirishaji",
      titleFor: (product: string) => `Usafirishaji wa ${product}`,
      heading: "Usafirishaji wa oda yako",
      from: (branch: string) => `kutoka ${branch}`,
      brandHeading: (brand: string) => `${brand} inaleta oda hii yenyewe`,
      brandBody: (branch: string, brand: string) =>
        `${branch} lina huduma yake ya usafirishaji. Ukishathibitisha, ${brand} itachukua na kukuletea mzigo — hakuna haja ya msafirishaji mwingine.`,
      agentHeading: (branch: string) => `${branch} halileti lenyewe`,
      agentBody: (city: string) => `Chagua msafirishaji wa mjini anayehudumia ${city} ili kukamilisha oda yako.`,
      blocked: "Haiwezi kuagizwa kwa sasa",
      similar: "Tafuta inayofanana",
    },
    form: {
      chooseAgent: "Chagua msafirishaji",
      chooseAgentBody: (branch: string, city: string) =>
        `${branch} halileti, kwa hiyo msafirishaji wa mjini anayehudumia ${city} atabeba oda hii.`,
      details: "Taarifa zako",
      quantity: "Idadi",
      fullName: "Jina kamili",
      phone: "Namba ya simu",
      phoneHint: "Namba ya simu ya Tanzania, mfano 0754 123 456.",
      city: "Mji wa kuletewa",
      cityHint: (city: string) => `Duka hili hufikisha mizigo ndani ya ${city}.`,
      choose: "Chagua…",
      elsewhere: "Mahali pengine",
      outside: (city: string) => `Duka hili haliwezi kufikisha mzigo nje ya ${city}.`,
      findShop: "Tafuta duka la mji wako",
      address: "Anwani ya kuletewa",
      addressHint: "Mtaa, eneo na alama yoyote itakayomsaidia dereva.",
      fix: (n: number) =>
        n === 1 ? "Taarifa 1 inahitaji kurekebishwa kabla hujaagiza." : `Taarifa ${n} zinahitaji kurekebishwa kabla hujaagiza.`,
      opening: "Malipo yanafunguliwa…",
      toPayment: "Endelea kwenye malipo",
      signIn: "Ingia ili uagize",
      adult: {
        before: "Nina umri wa miaka 18 au zaidi na ninakubali ",
        link: "masharti ya matumizi",
        after: ", ikiwemo haki ya siku 7 ya kurudisha bidhaa.",
      },
      noteSignedIn:
        "Hatua inayofuata ni kulipa kwa pesa ya simu. MalFleks inashikilia malipo yako mpaka mzigo ufike; tawi likishindwa kukupatia, unarudishiwa pesa yote.",
      noteSignedOut:
        "Kuagiza kunahitaji akaunti, ili MalFleks ipokee malipo yako na kuyashikilia mpaka mzigo ufike. Bado hakuna kilichotumwa wala kutozwa — ulichoandika kimehifadhiwa kwenye ukurasa huu na utakikuta ukirudi baada ya kuingia.",
    },
    agent: {
      verified: "Amethibitishwa",
      based: (city: string, regions: string) => `Yuko ${city} · Anahudumia ${regions}`,
      eta: (when: string) => `Muda: ${when}`,
    },
    summary: {
      heading: "Muhtasari wa oda",
      item: "Bidhaa",
      unitPrice: "Bei ya moja",
      quantity: "Idadi",
      from: "Kutoka",
      delivery: "Usafirishaji",
      notChosen: "Bado hajachaguliwa",
      total: "Jumla",
      branchDelivers: "Tawi linaleta lenyewe.",
      feeAdded: "Ada ya msafirishaji huongezwa wakati wa kulipa.",
      nothingAtDoor: "Unalipa kiasi chote kwa MalFleks, kwa hiyo hakuna cha kulipa mlangoni.",
    },
    confirmation: {
      title: "Ombi la oda limepokelewa",
      description: "Namba ya kumbukumbu ya ombi lako la oda na kinachofuata.",
      loading: "Ombi lako linapakiwa…",
      noneHeading: "Hakuna ombi la oda la kuonyesha",
      noneBody:
        "Ombi lililofanywa bila kuingia huhifadhiwa kwenye ukurasa huu wa kivinjari tu — ukurasa mwingine, au kipindi kilichokwisha fungwa, hautakuwa nalo. Hakuna kilichotumwa popote.",
      noneAccount: { before: "Kama ulikuwa umeingia ulipolifanya, litakuwa kwenye ", link: "akaunti yako", after: "." },
      browse: "Tazama bidhaa",
      eyebrow: "Ombi liko tayari",
      heading: (product: string) => `Ombi lako la ${product}`,
      reference: "Namba yako ya kumbukumbu",
      quote: (brandDelivered: boolean) =>
        `Itaje unapowasiliana na ${brandDelivered ? "tawi" : "tawi au msafirishaji"}.`,
      saved: "Imehifadhiwa kwenye akaunti yako.",
      findAgain: { link: "Ipate tena", after: " wakati wowote — kufunga ukurasa huu hakutaipoteza. " },
      track: { link: "Ifuatilie", after: " ikishalipiwa." },
      tabOnly: {
        before: "Ombi hili liko kwenye ukurasa huu wa kivinjari tu, kwa hiyo andika namba ya kumbukumbu au ",
        link: "ingia",
        after: " ili lijalo lihifadhiwe kwa ajili yako.",
      },
      next: "Kinachofuata",
      step1Saved: {
        before: "Bado hakuna kilicholipwa. Oda yako imehifadhiwa na MalFleks. ",
        link: "Fungua ukurasa wako wa malipo",
        after: (branch: string) =>
          ` ili uilipie. Ukiona inasema tawi lazima lithibitishe kwanza, ${branch} limeshaulizwa na tutakutumia barua pepe mara itakapoweza kulipiwa.`,
      },
      step1Unsaved: (branch: string, brandDelivered: boolean) =>
        `Hakuna kilicholipwa na hakuna kilichotengwa. Kwa kuwa hukuwa umeingia, ombi hili halijatumwa kwa MalFleks wala kwa ${branch} — liko kwenye ukurasa huu wa kivinjari tu. Tumia namba ya kumbukumbu hapo juu unapowasiliana na ${brandDelivered ? "tawi" : "tawi au msafirishaji"} mwenyewe.`,
      step2Brand: (branch: string, brand: string) =>
        `${branch} lina usafirishaji wake, kwa hiyo ${brand} itachukua na kukuletea mzigo. `,
      step2BrandCall: (phone: string) => `Piga simu tawini kwa ${phone} kuthibitisha kama bidhaa ipo na kukubaliana muda wa kuletewa.`,
      step2BrandNoPhone: {
        before: (city: string) =>
          `Hatuna namba iliyowekwa ya tawi hili, kwa hiyo peleka namba yako ya kumbukumbu tawini ${city} kuthibitisha kama bidhaa ipo na kukubaliana muda wa kuletewa — `,
        link: "anwani na saa zake za kufunguliwa",
        after: " ziko kwenye ukurasa wa tawi.",
      },
      step2Agent: (branch: string, carrier: string, city: string) =>
        `${branch} halileti, kwa hiyo ${carrier} — msafirishaji wa mjini anayehudumia ${city} — atabeba oda hii. `,
      step2AgentCall: (phone: string) => `Mpigie kwa ${phone} kupanga kuchukua mzigo tawini.`,
      step2AgentNoPhone: {
        before: "Namba yake iko kwenye ",
        link: "ukurasa wa wasafirishaji",
        after: "; mpigie kupanga kuchukua mzigo tawini.",
      },
      step3Saved: {
        before: "Unalipa kupitia MalFleks kwa pesa ya simu kwenye ",
        link: "ukurasa wako wa malipo",
        after: ". MalFleks inashikilia malipo yako mpaka mzigo ufike, na inakurudishia pesa yote tawi likishindwa kukupatia.",
      },
      step3Unsaved: (brandDelivered: boolean) =>
        `Malipo na gharama za usafirishaji mnakubaliana moja kwa moja na ${brandDelivered ? "tawi" : "tawi na msafirishaji"}. Kwa kuwa hukuwa umeingia, MalFleks haina kumbukumbu ya ombi hili na haipokei malipo yake.`,
      where: "Linakokwenda",
      name: "Jina",
      phone: "Simu",
      address: "Anwani",
      back: (product: string) => `Rudi kwenye ${product}`,
      keepBrowsing: "Endelea kutazama",
    },
    pay: {
      title: "Lipia oda yako",
      back: "Oda zako",
      headingPaid: "Malipo yamepokelewa",
      heading: "Lipia oda yako",
      footnote: {
        before:
          "Unalipa MalFleks, si tawi. Tunashikilia malipo yako mpaka mzigo ufike, kisha tunalilipa tawi na msafirishaji. Tawi likishindwa kukupatia oda au ikishindikana kufikishwa, unarudishiwa pesa yote. Soma ",
        link: "masharti",
        after: ".",
      },
      waitingHeading: "Tunasubiri tawi",
      waitingBody: (branch: string) =>
        `Oda hii inahitaji ${branch} lithibitishe bei na usafirishaji kabla haijaweza kulipiwa. Bado hudaiwi chochote — ukurasa huu utafunguka kwa malipo mara watakapothibitisha, na tutakutumia barua pepe pia. Unaweza kuuacha wazi; unajisasisha wenyewe.`,
      readyConfirmed: "Imethibitishwa — tayari kulipiwa",
      readyNew: "Lipa ili kuweka oda yako",
      readyConfirmedBody: (branch: string) =>
        `${branch} lina bidhaa hii kwa bei hii. Lipa kwa pesa ya simu kukamilisha oda yako.`,
      readyNewBody: (branch: string) =>
        `Lipa kwa pesa ya simu na oda yako itakwenda ${branch} mara moja. Wakishindwa kukupatia, unarudishiwa pesa yote.`,
      payAmount: (amount: string) => `Lipa ${amount}`,
      opens:
        "Inafungua ukurasa salama wa malipo wa ClickPesa kwenye ukurasa mpya. Huko unachagua mtandao wako wa pesa ya simu na kuthibitisha malipo kwenye simu yako. MalFleks haioni kamwe namba yako ya siri.",
      lastFailed: "Jaribio lako la mwisho halikufanikiwa, na hakuna kilichokatwa. Unaweza kujaribu tena kwa kitufe kilekile.",
      paidAlready: "Umeshalipa?",
      paidAlreadyBody: "Kwa kawaida huonekana hapa ndani ya dakika moja. Isipoonekana, uliza ClickPesa sasa.",
      checking: "Inakagua…",
      checkNow: "Nimelipa — kagua sasa",
      notYet:
        "Bado hayajapokelewa. Kama simu yako ilionyesha malipo yamefanikiwa, subiri dakika moja kisha kagua tena — hutatozwa mara mbili kwa kubonyeza hapa.",
      paidHeading: "Umelipa — asante",
      received: (amount: string) => `Tumepokea ${amount}. `,
      receivedPlain: "Tumepokea malipo yako. ",
      paidBody: (branch: string) =>
        `${branch} limeambiwa likuletee oda yako, na MalFleks inashikilia malipo yako mpaka mzigo ufike.`,
      paymentReference: "Kumbukumbu ya malipo",
      track: "Fuatilia mzigo wako",
      cancelledHeading: "Oda hii ilighairiwa",
      reasonGiven: (reason: string) => `Sababu iliyotolewa: ${reason}. `,
      nothingDue: "Hudaiwi chochote.",
      browse: "Tazama bidhaa",
      unavailableHeading: "Malipo ya oda hii bado hayajafunguliwa",
      unavailable: {
        before:
          "Oda yako imehifadhiwa, lakini hatukuweza kufungua ukurasa wa malipo kwa sasa. Hakuna kilichotozwa. Jaribu tena baada ya dakika chache, au ",
        link: "wasiliana nasi",
        after: " ukiwa na namba yako ya kumbukumbu.",
      },
      summaryLabel: "Muhtasari wa oda",
      yourOrder: "Oda yako",
      delivery: (carrier: string) => `Usafirishaji (${carrier})`,
      total: "Jumla",
      from: "Kutoka",
      deliveredBy: "Analeta",
      yourNumber: "Namba yako",
    },
  },
};

/**
 * How a carrier stored on an order is shown. A brand's own fleet is stored as
 * "Toyota own fleet" -- English, written when the order was placed -- so it
 * is rebuilt in the reader's language; a courier's name is shown as it is.
 */
export function carrierLabel(carrier: string, locale: "en" | "sw"): string {
  if (locale === "en") return carrier;
  const own = /^(.*) own fleet$/.exec(carrier);
  return own ? `Usafirishaji wa ${own[1]} yenyewe` : carrier;
}
