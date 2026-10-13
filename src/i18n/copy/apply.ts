/**
 * The words of becoming a partner, and of the contact page. English and
 * Swahili side by side.
 *
 * The Swahili was written by Claude on 4 Oct 2026 and is the owner's to
 * correct; keep each line saying what its English neighbour says.
 */
export const APPLY = {
  en: {
    dateLocale: "en-GB",
    page: {
      title: "Become a partner",
      description:
        "Apply to sell through MalFleks as a shop, or to carry deliveries as a local courier. MalFleks has shops in Dodoma today.",
      eyebrow: "Sell or deliver with us",
      heading: "Become a MalFleks partner",
      intro:
        "MalFleks connects real shops in Tanzania to customers, and gets the goods there — either on the brand's own van, or with a local courier. If you run a branch or carry deliveries, this is where you start.",
      step: (n: string) => `STEP ${n}`,
      steps: [
        { title: "You apply", body: "A few details about your branch or your courier business. It takes a minute." },
        { title: "We check it by hand", body: "Someone at MalFleks reads every application. Nothing is approved automatically." },
        { title: "You're set up", body: "Approved partners get access to list products or receive delivery jobs." },
      ],
      footnote:
        "A person at MalFleks reads every application, and we email you as soon as it has been decided. MalFleks has shops in Dodoma today; you can also apply from Dar es Salaam, Arusha or Mwanza.",
    },
    errors: {
      businessBrand: "Enter the branch or shop name.",
      businessCourier: "Enter your courier business name.",
      contact: "Enter the name of the person we should speak to.",
      phoneMissing: "Enter a phone number we can reach you on.",
      phoneInvalid: "Enter a Tanzanian mobile number, e.g. 0754 123 456.",
      cityMissing: "Choose the city you operate in.",
      cityUnserved: "MalFleks does not cover that city yet.",
      brandMissing: "Choose the brand you sell, or name it if it isn't listed.",
      brandUnknown: "That brand isn't one we know. Name it instead.",
      address: "Enter the street and area the branch trades from.",
      deliveryMode: "Choose who pays for delivery on your orders.",
      notes: (max: number) => `Keep this under ${max} characters.`,
    },
    form: {
      failSignedOut: "Your session expired. Sign in again and resend this.",
      failQuota: "You already have several applications waiting. We'll work through those first.",
      failRejected: "Something in the form didn't pass our checks. Look over it and try again.",
      failRate: "You've submitted a few applications in quick succession. Wait a bit and try again.",
      failOther: "We couldn't record this right now. Nothing was saved — your answers are still here, so try again in a moment.",
      signInHeading: "Sign in to apply",
      signInBody:
        "We ask for a sign-in because the account you apply with becomes the account you manage your branch from. Nothing else about your MalFleks account changes, and applying costs nothing.",
      signInAction: "Sign in to continue",
      doneHeading: "Application received",
      doneBody: {
        before: "It is recorded against your account. Someone at MalFleks reviews every application by hand — ",
        strong: "there is no automatic approval",
        after: ", and we will contact you on the number you gave us.",
      },
      back: "Back to MalFleks",
      partnerHeading: "You are already a MalFleks partner",
      liveCourier: "Your courier account is live. Delivery jobs and your coverage are in your partner area.",
      liveShop: "Your shop is live on MalFleks. List a product or check what is waiting for review in your partner area.",
      notLive:
        "Your application was approved and your account is ready. MalFleks has not put you on the map yet — that is a second step someone here does by hand, and until it is done you cannot list anything. You do not need to apply again; we will call you on the number you gave us.",
      partnerArea: "Go to your partner area",
      pendingHeading: "Your application is with us",
      received: "Received",
      pendingBody: {
        before: "Someone at MalFleks reads every application by hand, so this takes a little time. ",
        strong: "You do not need to send another one",
        after: " — we will call you on the number you gave us.",
      },
      rejectedNote:
        "We reviewed an earlier application from this account and were not able to take it on. You are welcome to apply again — if anything has changed about your branch or your delivery business, say so in the notes at the end.",
      kindLegend: "What are you applying as?",
      kindBrand: "A brand branch",
      kindBrandBlurb: "You have a shop or showroom and want to sell through MalFleks.",
      kindCourier: "A delivery courier",
      kindCourierBlurb: "You carry goods and want to be offered delivery jobs.",
      businessBrand: "Branch or shop name",
      businessCourier: "Courier business name",
      contact: "Who should we speak to?",
      phone: "Phone number",
      phoneHint: "A Tanzanian mobile number, e.g. 0754 123 456.",
      cityBrand: "Which city is the branch in?",
      cityCourier: "Which city do you cover?",
      chooseCity: "Choose a city…",
      brand: "Which brand do you sell?",
      brandHint: "Not listed? Leave it on 'Another brand' and type the name below.",
      anotherBrand: "Another brand",
      brandOther: "Name the brand",
      address: "Street and area the branch trades from",

      // Who pays for delivery. The shop answers once, here, and it sets what
      // every one of its customers is charged -- so the labels say the
      // consequence, not the policy name.
      deliveryLegend: "Who pays for delivery?",
      deliveryHint:
        "Delivery is charged per city. Whatever you choose, the delivery person is paid in full \u2014 this only decides who covers it.",
      deliveryCustomer: "The customer pays it",
      deliveryCustomerBlurb: "The delivery fee is added to what the customer pays at checkout. You receive the full price of your goods.",
      deliverySplit: "We split it with the customer",
      deliverySplitBlurb: "The customer pays half at checkout; your half comes out of your payout. A cheaper price on the page, slightly less to you.",
      deliveryShop: "We deliver it ourselves",
      deliveryShopBlurb: "The customer pays nothing for delivery. If a MalFleks courier ends up doing the run, the fee comes out of your payout.",

      // The documents. Three, and the reason for each, because a shopkeeper
      // asked for paperwork with no reason given assumes the worst.
      documentsHeading: "Your paperwork",
      documentsIntro:
        "Customers pay before they receive their goods, and MalFleks holds that money until they confirm delivery. So we check that every shop is a real registered business before it can sell. Three files, read by our system and then by a person.",
      documentsPrivate: "These are stored privately. They are never shown on your shop page, to customers, or to anyone outside MalFleks.",
      documentLicence: "Business licence (leseni ya biashara)",
      documentLicenceHint: "A photo or scan of your trading licence. It should show the business name and still be in date.",
      documentTin: "TIN certificate",
      documentTinHint: "Your TRA taxpayer certificate. We check the name and TIN match your licence.",
      documentShopfront: "Photo of your shop front",
      documentShopfrontHint: "A picture of the outside of your shop, with the signage if you have it.",
      documentsIntroCourier:
        "Riders carry customers' goods to their door. So before anyone is given a delivery, a person at MalFleks checks their driving licence. One file.",
      documentDriving: "Driving licence (leseni ya udereva)",
      documentDrivingHint:
        "A clear photo of your driving licence card, the side with your photo and name. It must cover the vehicle you deliver with and still be in date.",
      documentAdd: "Choose file",
      documentReplace: "Replace",
      documentRemove: "Remove",
      documentPreparing: "Preparing\u2026",
      documentUploading: "Uploading\u2026",
      documentDone: "Attached",
      documentRetry: "Try again",
      documentMissing: "Attach this one before sending.",
      documentWrongType: "We can read photos (JPG, PNG, WebP) and PDFs. Convert it and try again.",
      documentTooBig: "That file is too large. A phone photo of the page is enough.",
      documentEmpty: "That file is empty.",
      documentUnavailable: "Uploads aren't available right now. Try again in a few minutes.",
      documentFailed: "That upload didn't finish. Your file is still here \u2014 try again.",
      documentsSending: "Attaching your documents\u2026",
      documentsLate:
        "Your application is saved, but the documents didn't upload. Nothing is lost \u2014 press 'Try again' and they will attach to the same application.",
      documentsLateRetry: "Try the documents again",

      notes: "Anything else? (optional)",
      notesHintBrand: "How many branches you run, what you stock, whether you deliver yourself.",
      notesHintCourier: "How many riders, what you carry, which areas you know best.",
      check: "Check the highlighted answers and send again.",
      sending: "Sending…",
      send: "Send application",
      footnote: "MalFleks reviews every application by hand. Nothing is approved automatically, and applying costs nothing.",
    },
  },
  sw: {
    dateLocale: "sw-TZ",
    page: {
      title: "Jiunge kama mshirika",
      description:
        "Omba kuuza kupitia MalFleks kama duka, au kusafirisha mizigo kama msafirishaji wa mjini. Leo MalFleks ina maduka Dodoma.",
      eyebrow: "Uza au safirisha pamoja nasi",
      heading: "Kuwa mshirika wa MalFleks",
      intro:
        "MalFleks inaunganisha maduka halisi ya Tanzania na wateja, na kufikisha bidhaa — kwa gari la chapa yenyewe, au kwa msafirishaji wa mjini. Kama una tawi au unasafirisha mizigo, anzia hapa.",
      step: (n: string) => `HATUA ${n}`,
      steps: [
        { title: "Unaomba", body: "Taarifa chache kuhusu tawi lako au biashara yako ya usafirishaji. Inachukua dakika moja." },
        { title: "Tunakagua kwa mkono", body: "Mtu wa MalFleks husoma kila ombi. Hakuna kinachokubaliwa kiotomatiki." },
        { title: "Unaanza kazi", body: "Washirika waliokubaliwa hupata nafasi ya kuweka bidhaa au kupokea kazi za usafirishaji." },
      ],
      footnote:
        "Mtu wa MalFleks husoma kila ombi, na tunakutumia barua pepe mara uamuzi unapofanyika. Leo MalFleks ina maduka Dodoma; unaweza pia kuomba ukiwa Dar es Salaam, Arusha au Mwanza.",
    },
    errors: {
      businessBrand: "Andika jina la tawi au duka.",
      businessCourier: "Andika jina la biashara yako ya usafirishaji.",
      contact: "Andika jina la mtu tutakayeongea naye.",
      phoneMissing: "Andika namba ya simu tunayoweza kukupata.",
      phoneInvalid: "Andika namba ya simu ya Tanzania, mfano 0754 123 456.",
      cityMissing: "Chagua mji unaofanyia kazi.",
      cityUnserved: "MalFleks bado haihudumii mji huo.",
      brandMissing: "Chagua chapa unayouza, au itaje kama haipo kwenye orodha.",
      brandUnknown: "Chapa hiyo hatuijui. Itaje kwa jina badala yake.",
      address: "Andika mtaa na eneo ambako tawi linafanyia biashara.",
      deliveryMode: "Chagua ni nani analipia usafirishaji kwa oda zako.",
      notes: (max: number) => `Usizidi herufi ${max}.`,
    },
    form: {
      failSignedOut: "Kipindi chako kimeisha. Ingia tena kisha utume upya.",
      failQuota: "Tayari una maombi kadhaa yanayosubiri. Tutayashughulikia hayo kwanza.",
      failRejected: "Kuna kitu kwenye fomu hakikupita ukaguzi wetu. Ipitie kisha ujaribu tena.",
      failRate: "Umetuma maombi kadhaa kwa haraka. Subiri kidogo kisha ujaribu tena.",
      failOther: "Hatukuweza kuhifadhi ombi hili kwa sasa. Hakuna kilichohifadhiwa — majibu yako bado yapo hapa, jaribu tena baada ya muda mfupi.",
      signInHeading: "Ingia ili uombe",
      signInBody:
        "Tunaomba uingie kwa sababu akaunti unayoombea ndiyo utakayosimamia tawi lako nayo. Hakuna kingine kinachobadilika kwenye akaunti yako ya MalFleks, na kuomba hakuna gharama.",
      signInAction: "Ingia ili uendelee",
      doneHeading: "Ombi limepokelewa",
      doneBody: {
        before: "Limehifadhiwa kwenye akaunti yako. Mtu wa MalFleks hukagua kila ombi kwa mkono — ",
        strong: "hakuna kukubaliwa kiotomatiki",
        after: ", na tutawasiliana nawe kwa namba uliyotupa.",
      },
      back: "Rudi MalFleks",
      partnerHeading: "Tayari wewe ni mshirika wa MalFleks",
      liveCourier: "Akaunti yako ya usafirishaji iko hewani. Kazi za usafirishaji na maeneo unayohudumia viko kwenye eneo lako la mshirika.",
      liveShop: "Duka lako liko hewani kwenye MalFleks. Weka bidhaa au angalia kinachosubiri kukaguliwa kwenye eneo lako la mshirika.",
      notLive:
        "Ombi lako limekubaliwa na akaunti yako iko tayari. MalFleks bado haijakuweka kwenye ramani — hiyo ni hatua ya pili inayofanywa na mtu wetu kwa mkono, na mpaka ifanyike huwezi kuweka chochote. Huhitaji kuomba tena; tutakupigia kwa namba uliyotupa.",
      partnerArea: "Nenda kwenye eneo lako la mshirika",
      pendingHeading: "Ombi lako tunalo",
      received: "Limepokelewa",
      pendingBody: {
        before: "Mtu wa MalFleks husoma kila ombi kwa mkono, kwa hiyo inachukua muda kidogo. ",
        strong: "Huhitaji kutuma jingine",
        after: " — tutakupigia kwa namba uliyotupa.",
      },
      rejectedNote:
        "Tulipitia ombi la awali la akaunti hii na hatukuweza kulikubali. Unakaribishwa kuomba tena — kama kuna kilichobadilika kuhusu tawi lako au biashara yako ya usafirishaji, kieleze kwenye maelezo ya mwisho.",
      kindLegend: "Unaomba kama nani?",
      kindBrand: "Tawi la chapa",
      kindBrandBlurb: "Una duka au showroom na unataka kuuza kupitia MalFleks.",
      kindCourier: "Msafirishaji",
      kindCourierBlurb: "Unabeba mizigo na unataka kupewa kazi za usafirishaji.",
      businessBrand: "Jina la tawi au duka",
      businessCourier: "Jina la biashara ya usafirishaji",
      contact: "Tuongee na nani?",
      phone: "Namba ya simu",
      phoneHint: "Namba ya simu ya Tanzania, mfano 0754 123 456.",
      cityBrand: "Tawi liko mji gani?",
      cityCourier: "Unahudumia mji gani?",
      chooseCity: "Chagua mji…",
      brand: "Unauza chapa gani?",
      brandHint: "Haipo kwenye orodha? Acha ‘Chapa nyingine’ kisha andika jina hapa chini.",
      anotherBrand: "Chapa nyingine",
      brandOther: "Taja chapa",
      address: "Mtaa na eneo ambako tawi linafanyia biashara",

      deliveryLegend: "Nani analipia usafirishaji?",
      deliveryHint:
        "Usafirishaji unalipwa kwa kila jiji. Chaguo lolote, msafirishaji analipwa kamili \u2014 hili linaamua tu ni nani anagharamia.",
      deliveryCustomer: "Mteja analipa",
      deliveryCustomerBlurb: "Gharama ya usafirishaji inaongezwa kwenye malipo ya mteja. Wewe unapokea bei kamili ya bidhaa zako.",
      deliverySplit: "Tunagawana na mteja",
      deliverySplitBlurb: "Mteja analipa nusu; nusu yako inatolewa kwenye malipo yako. Bei nafuu kwenye ukurasa, kidogo pungufu kwako.",
      deliveryShop: "Tunasafirisha wenyewe",
      deliveryShopBlurb: "Mteja hagharamii usafirishaji. Kama msafirishaji wa MalFleks atafanya safari, gharama inatolewa kwenye malipo yako.",

      documentsHeading: "Nyaraka zako",
      documentsIntro:
        "Wateja wanalipa kabla ya kupokea mzigo, na MalFleks inashika pesa hiyo hadi wathibitishe. Kwa hiyo tunahakikisha kila duka ni biashara iliyosajiliwa kabla ya kuuza. Faili tatu, zinasomwa na mfumo wetu kisha na mtu.",
      documentsPrivate: "Zinatunzwa kwa siri. Haziwekwi kwenye ukurasa wa duka lako, hazionekani kwa wateja, wala kwa mtu yeyote nje ya MalFleks.",
      documentLicence: "Leseni ya biashara",
      documentLicenceHint: "Picha au skani ya leseni yako. Ionyeshe jina la biashara na iwe bado hai.",
      documentTin: "Cheti cha TIN",
      documentTinHint: "Cheti chako cha TRA. Tunakagua jina na namba ya TIN zinalingana na leseni.",
      documentShopfront: "Picha ya mbele ya duka lako",
      documentShopfrontHint: "Picha ya nje ya duka lako, na bango kama unalo.",
      documentsIntroCourier:
        "Wasafirishaji hubeba mizigo ya wateja hadi mlangoni. Kwa hiyo kabla mtu hajapewa mzigo wa kupeleka, mtu wa MalFleks hukagua leseni yake ya udereva. Faili moja.",
      documentDriving: "Leseni ya udereva",
      documentDrivingHint:
        "Picha safi ya kadi ya leseni yako ya udereva, upande wenye picha na jina lako. Iruhusu chombo unachotumia kupeleka mizigo na iwe bado hai.",
      documentAdd: "Chagua faili",
      documentReplace: "Badilisha",
      documentRemove: "Ondoa",
      documentPreparing: "Inatayarisha\u2026",
      documentUploading: "Inatuma\u2026",
      documentDone: "Imeambatishwa",
      documentRetry: "Jaribu tena",
      documentMissing: "Ambatisha hii kabla ya kutuma.",
      documentWrongType: "Tunasoma picha (JPG, PNG, WebP) na PDF. Badilisha muundo na ujaribu tena.",
      documentTooBig: "Faili ni kubwa mno. Picha ya simu ya ukurasa inatosha.",
      documentEmpty: "Faili hii haina kitu.",
      documentUnavailable: "Kutuma faili hakupatikani kwa sasa. Jaribu baada ya dakika kadhaa.",
      documentFailed: "Kutuma hakukamilika. Faili lako lipo \u2014 jaribu tena.",
      documentsSending: "Inaambatisha nyaraka zako\u2026",
      documentsLate:
        "Maombi yako yamehifadhiwa, lakini nyaraka hazijatumwa. Hakuna kilichopotea \u2014 bonyeza 'Jaribu tena' na zitaambatana na maombi hayo hayo.",
      documentsLateRetry: "Jaribu nyaraka tena",

      notes: "Kuna kingine? (si lazima)",
      notesHintBrand: "Una matawi mangapi, unauza nini, na kama unaleta mwenyewe.",
      notesHintCourier: "Una waendeshaji wangapi, unabeba nini, na maeneo unayoyajua zaidi.",
      check: "Kagua majibu yaliyowekewa alama kisha utume tena.",
      sending: "Inatuma…",
      send: "Tuma ombi",
      footnote: "MalFleks hukagua kila ombi kwa mkono. Hakuna kinachokubaliwa kiotomatiki, na kuomba hakuna gharama.",
    },
  },
};

export const CONTACT = {
  en: {
    title: "Contact",
    description: "How to reach MalFleks — one email address, read by a person, with what to include so we can help quickly.",
    heading: "Contact",
    intro: "MalFleks is small, and a person reads everything that comes in. One address, and it is checked.",
    email: "Email",
    aim: "We aim to answer within a couple of working days. If something has gone wrong with an order, say so in the subject line and it gets read first.",
    orderHeading: "About an order you sent",
    orderBody:
      "Include the reference from your confirmation — it is the fastest way to find the exact request. MalFleks passes your request to the branch, so if you have already agreed a delivery time with them, they are the ones who can change it. If they have gone quiet, tell us and we will chase them. If you paid through MalFleks and something is wrong — a refund you are waiting for, or a charge you do not recognise — write to us: we hold that payment, and sorting it out is our job, not the branch's.",
    listingHeading: "About listing your business",
    listing: {
      before: "Start with the ",
      link: "partner application",
      after: " rather than an email — it asks for what we need to check, and it lands in the review queue instead of an inbox.",
    },
    wrongHeading: "About a listing that is wrong",
    wrongBody:
      "An address that does not exist, a price that is out of date, a brand or logo used where it should not be — press \"Report this listing\" on its page, or send the link and what is wrong with it. We would rather take a listing down and put it back than leave a customer travelling to the wrong place.",
    dataHeading: "About your data",
    data: {
      before: "What we hold and how to have it deleted is set out in the ",
      link: "privacy notice",
      after: ". Write from the address you signed in with and we will act on it.",
    },
    whoHeading: "Who we are",
  },
  sw: {
    title: "Wasiliana nasi",
    description: "Jinsi ya kuifikia MalFleks — anwani moja ya barua pepe, inayosomwa na mtu, na cha kuandika ili tukusaidie haraka.",
    heading: "Wasiliana nasi",
    intro: "MalFleks ni ndogo, na mtu husoma kila kinachoingia. Anwani ni moja, na inaangaliwa.",
    email: "Barua pepe",
    aim: "Tunalenga kujibu ndani ya siku chache za kazi. Kama kuna tatizo kwenye oda, liseme kwenye kichwa cha barua na itasomwa kwanza.",
    orderHeading: "Kuhusu oda uliyotuma",
    orderBody:
      "Weka namba ya kumbukumbu kutoka kwenye uthibitisho wako — ndiyo njia ya haraka zaidi ya kulipata ombi husika. MalFleks hupeleka ombi lako tawini, kwa hiyo kama mmeshakubaliana muda wa kuletewa, wao ndio wanaoweza kuubadilisha. Wakinyamaza, tuambie nasi tutawafuatilia. Kama ulilipa kupitia MalFleks na kuna tatizo — pesa unayosubiri kurudishiwa, au makato usiyoyatambua — tuandikie: malipo hayo tunayashikilia sisi, na kuyashughulikia ni kazi yetu, si ya tawi.",
    listingHeading: "Kuhusu kuorodhesha biashara yako",
    listing: {
      before: "Anza na ",
      link: "ombi la kuwa mshirika",
      after: " badala ya barua pepe — linauliza tunachohitaji kukagua, na linaingia kwenye foleni ya ukaguzi badala ya kikasha cha barua.",
    },
    wrongHeading: "Kuhusu tangazo lenye makosa",
    wrongBody:
      "Anwani isiyokuwepo, bei iliyopitwa na wakati, chapa au nembo iliyotumika pasipostahili — bonyeza \"Ripoti tangazo hili\" kwenye ukurasa wake, au tuma kiungo na ueleze kosa lake. Ni afadhali tuliondoe tangazo na kulirudisha kuliko kumwacha mteja asafiri kwenda mahali pasipo sahihi.",
    dataHeading: "Kuhusu taarifa zako",
    data: {
      before: "Tunachohifadhi na jinsi ya kuomba kifutwe vimeelezwa kwenye ",
      link: "taarifa ya faragha",
      after: ". Andika ukitumia anwani uliyoingia nayo nasi tutalishughulikia.",
    },
    whoHeading: "Sisi ni nani",
  },
};
