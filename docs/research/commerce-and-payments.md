# Commerce & Payments — Tanzania

**ENG-8 · Ledger, Phase 0. Recorded 2026-08-15.**

Scope: what actually exists for taking money in Tanzania's mobile-money-first market,
what regulation shapes it, why cash-on-delivery is the default and where it breaks,
and — the point of this document — what the smallest honest step is from Soko's
current order *request* (`src/lib/order.ts`) to a real transaction.

## 1. Who to learn from / authoritative sources

**Primary / official (highest confidence):**
- [National Payment Systems Act, No. 4 of 2015 — full text](https://tanzanialaws.com/n/678-national-payment-systems-act) — the actual statute. Sections 5 (payment systems), 15 (payment instruments), 24 (electronic money) are the licensing backbone.
- [Bank of Tanzania — Bank Supervision mandate](https://www.bot.go.tz/BankSupervision/Mandate) — thin on payment-system specifics; confirms BOT licenses banks/financial institutions/bureau de change directly, but I could not get granular fintech-licensing detail from BOT's own site (see §4).
- [Selcom](https://www.selcom.net/) — one of Tanzania's largest aggregators, fetched directly; confirms product categories (till number + QR collection, card acquiring, bill payment) but the page has no public onboarding/pricing detail.

**Secondary, but specific and plausible (legal-summary sites, not the regulator itself):**
- [Global Law Experts — Bank/PSP licensing requirements Tanzania](https://globallawexperts.com/bank-payment-service-provider-licensing-requirements-tanzania/) — names the three 2015 subordinate regulations and the bank-vs-non-bank licensing split.
- [PayAtlas — Tanzania country page](https://payatlas.com/countries/tanzania-united-republic-of-tz) — fee ranges and PSP list. This is an aggregator-comparison site, not a regulator or a bank; treat its numbers as indicative, not quoted rates.
- [ClickPesa — Tanzania payment gateway guide 2025](https://clickpesa.com/ultimate-tanzania-payment-gateway-guide-in-2025/) — a payments vendor's own marketing/guide content, so read its comparisons as self-interested but its integration-timeline claims as plausible.

**Secondary, general Africa e-commerce commentary (used for COD failure modes and escrow mechanics only):**
- [Shipink — COD guide](https://shipink.io/blog/cash-on-delivery-cod-ecommerce-guide/), [i-payout — marketplace escrow](https://www.i-payout.com/blog/what-is-marketplace-escrow-and-why-does-it-matter), [DPO Group — top e-commerce challenges in Africa](https://dpogroup.com/blog/the-top-five-ecommerce-challenges-in-africa-and-how-to-overcome-them/).

**Not usable:** a Lexology article specifically on a BOT notice restricting e-money licence issuance returned HTTP 403 — abandoned per instructions, not incorporated. **No video sources were used or needed.**

## 2. What the landscape actually is

### 2.1 Mobile money rails

Tanzania's mobile money market is **split three (really four) ways, not dominated by one player** the way Kenya is by M-Pesa. The live wallets are Vodacom **M-Pesa**, Tigo (Yas) **Tigo Pesa** — now marketed as **Mixx by Yas** — **Airtel Money**, and Halotel's **HaloPesa**. Multiple sources describe the three major wallets as interoperable for peer transfers since roughly 2014, but I could not independently verify the interoperability mechanism (Tanzania has a BOT-run instant payment switch, commonly referred to as TIPS, but I did not fetch a primary BOT source describing it — **flag as uncertain**). Interoperability for *customer-to-customer* transfer does not mean a merchant integration can ignore the differences between wallets: a checkout still needs to either integrate each telco's API separately or use an aggregator that abstracts them. ([Riverpe overview](https://www.riverpe.com/blog/tanzania-payment-methods-m-pesa-airtel-money-tigo-pesa), [McTaba Airtel Money guide](https://www.mctaba.com/learn/tanzania/airtel-money-api-integration-tanzania))

**HaloPesa specifically is a gap in my research** — since Halotel is one of Soko's six brands, I looked for HaloPesa's merchant-API story and found nothing beyond it being named as one of the four wallets. Unverified whether it's covered by the aggregators below on the same terms as the big three.

### 2.2 Who you actually integrate with

Direct-to-telco integration requires **business registration and per-provider approval, with a 2–4 week timeline per wallet** (ClickPesa). That is a real cost for a startup with six brand relationships and no payments team. The realistic path — and what every source converges on — is a **payment aggregator that already holds the relationships**: Selcom, Azampay, ClickPesa, Pesapal, and pan-African players (DPO Group, Flutterwave) all expose one API/checkout that routes to M-Pesa, Tigo Pesa and Airtel Money, plus cards and bank transfer, and handle reconciliation. A merchant gets a **till number and/or QR code** for collection rather than negotiating with each telco.

Fee ranges reported (PayAtlas, not a primary rate card — **treat as indicative**): mobile money merchant fees roughly **1.5–3%**, card payments **2.5–6%**, payout/withdrawal fees **TZS 500–2,000**, settlement in **3–7 business days**. I found no official BOT or aggregator fee schedule to confirm these against; they should be re-verified against an actual aggregator quote before anyone builds pricing around them.

### 2.3 Regulation — what a founder needs to know

Confirmed against the **statute text itself** (`tanzanialaws.com`), which is the strongest source in this document:

- **National Payment Systems Act No. 4 of 2015.** Section 5: no one may *operate a payment system* without a BOT payment system licence. Section 15: no one may *issue electronic payment instruments* without BOT authorisation. Section 24: no one may *distribute electronic money* without a licence. These are three distinct licensable activities — a full e-money issuer needs all three, which is more onerous than a single "payment licence" mental model.
- **Bank vs. non-bank treatment differs**: banks/financial institutions already supervised by BOT get *approval* under their existing banking licence (with notification to BOT); non-banks, telcos, and independent fintechs need a **dedicated payment system provider licence** from BOT. Telco-issued mobile money additionally involves **TCRA** (an application/telecom-services licence layer), since the wallet rides on the telecom licence.
- Processing timelines cited by the secondary legal-summary source (Global Law Experts, not the Act itself): ~10 days for a payment-instrument authorisation, ~30 days for payment-system/e-money licences.
- **KYC/AML**: identity verification via government ID, proof of address and business documentation is the standard merchant/customer onboarding bar (PayAtlas). VAT registration triggers around TZS 100M annual turnover (secondary source, unverified against TRA directly).

**The critical implication for Soko: none of this means Soko needs to become a BOT-licensed payment institution.** The Act licenses the entity that *operates the payment system or issues e-money* — that's the aggregator (Selcom, Azampay, etc.), which already holds the licence. Soko's realistic regulatory posture is **merchant/client of a licensed aggregator**, not licence-holder. That is a load-bearing distinction and the main thing this research should change in how the team talks about "payments."

### 2.4 Cash on delivery — why it persists, and its real failure modes

COD dominates African e-commerce because card penetration is low and buyers distrust paying before they can inspect goods (Shipink, DPO Group). Its documented failure modes, consistent across sources:

1. **Refused deliveries** — the customer declines at the door; the merchant/courier has paid for outbound logistics with zero revenue, and often pays again for the return leg.
2. **Low-intent / fraudulent orders** — orders placed with no real intent to pay, which COD makes trivially easy since nothing is committed at order time.
3. **Cash-handling risk for the driver** — reconciliation errors, theft exposure, and the operational overhead of counting and banking cash at shift end.
4. **Address/informal-addressing friction** — a general African last-mile problem (All Business Africa) that compounds COD risk: a failed delivery attempt is also a failed collection attempt.

The documented industry response is **not eliminating COD but filtering it** — predictive scoring of which orders are likely to convert, and increasingly, a small non-refundable payment collected at order time (deposit or reservation fee) specifically to filter low-intent orders before a driver is dispatched.

### 2.5 Marketplace trust mechanics — escrow, holding funds, disputes

General pattern across marketplace-payments explainers (i-payout, Bagisto, Rapyd — none of these are Tanzania-specific, so treat as generic SaaS-payments literature, not local practice): a marketplace collects the buyer's payment into a **pooled/neutral account it controls**, holds it until a defined release condition (delivery confirmation, or auto-release after a timeout with no dispute raised), then **splits** the held amount between the seller/fulfilling party and the platform's own commission. If a dispute is raised before release, the platform freezes that specific transaction's funds and adjudicates using whatever evidence exists (photos, delivery confirmation codes, agent/branch statements).

None of these sources address the specific question that matters here — **who bears risk when the seller's own fleet delivers versus when an independent third party does.** That split is not a payment-rail question; it is a contractual/product design choice the marketplace has to make explicitly. Section 3 below is my reasoning on it, not a sourced fact.

## 3. What this means for Soko

### 3.1 The current state, restated precisely

`OrderRequest` (built in `createOrderRequest()`, `src/lib/order.ts:314`) is generated **entirely client-side**, written to `sessionStorage` under `ORDER_STORAGE_KEY`, and — per the file's own header comment — "never sent anywhere." `OrderConfirmation.tsx` tells the customer explicitly: *"Nothing has been paid and nothing has been reserved... this request has not been transmitted to anyone."* The reference code (`generateOrderReference`) is cosmetic — client-generated, "means nothing to any system," purely so a human can read it down a phone line.

This means the honest next step is **not** "add a payment button." A payment collected against a record nobody's backend has ever seen is worse than no payment feature — it would be Soko taking money for an order that, structurally, could vanish if the tab closes. Debt #14 (two persistence stacks, neither read by a page) is the actual blocker sitting in front of payments, not a side issue.

### 3.2 The smallest honest sequence

**Step 0 (not payments, but prerequisite):** the `OrderRequest` has to become a server-persisted record with a stable ID and a status, reachable by both the customer and the branch/agent. Nothing below is honest without this, because "money changed hands for order X" requires order X to durably exist.

**Step 1 — collect money, don't hold it yet.** Once orders persist, the smallest real transaction is: branch or agent confirms availability/price against the pending request (this conversational step already exists per `OrderConfirmation`'s "what happens next" copy — it just isn't wired to anything) → Soko sends the customer a **mobile-money payment request** (a "push" / Lipa Namba prompt to the phone number already collected in `customer.phone`) via **one aggregator** (Selcom or Azampay are the concrete, Tanzania-headquartered candidates from §2.2) rather than integrating telcos directly. This gets Soko out of needing any BOT licence at all (§2.3) — it is a merchant relationship, not a payment-system operator relationship.

**Step 2 — decide what "confirmed" pays for.** Given COD's failure modes (§2.4), the cheapest real improvement over today is not "pay in full up front" but a **small non-refundable request/reservation fee** collected at the moment the branch confirms price — filtering low-intent orders — with the remainder still collected on delivery (cash or mobile money) for products where full prepayment isn't yet trusted. This matches how the market actually behaves (COD stays dominant) while giving Soko its first real, honest transaction and its first real commission event.

**Step 3 — only after Step 1/2 are working — escrow-style holding for full-value orders.** Hold the full amount in Soko's collection account until a delivery-confirmation event, then split. This is where the brand-fleet/agent distinction in `resolveDeliveryRoute()` actually matters for risk, not before.

### 3.3 Where money sits and who bears risk, by route

- **Brand route (`route.kind === "brand"`, `branch.deliveryOffered === true`)** — the brand's own branch and driver own the entire fulfillment chain. Soko's honest role here is **collections agent, not merchant of record**: collect the payment, take a commission, remit the rest to the brand. Delivery risk (wrong item, damage, non-delivery) stays with the brand — Soko's only exposure is payment reconciliation (did the money move, did the brand get paid), not fulfillment. This is the lower-risk route and the one to build first.

- **Agent route (`route.kind === "agent"`, third-party courier from `getAgentsForCity`)** — three parties now: Soko, the brand/branch (who owns the goods), and an independent courier Soko is vouching for but does not employ. This is the route where an escrow-style hold earns its complexity: if Soko just passes payment straight through, it has vouched for a courier it doesn't control with no leverage if the courier doesn't deliver. Holding funds until a **delivery-confirmation event** (something as simple as the agent or customer confirming against the order reference) gives Soko a lever — release payment only on confirmation, refund/retry on failure — and makes explicit, for the first time, that **Soko is the trust layer between an unverified courier and real money**, not just a phone-number router. This is also the route where a dispute process (§2.5) is unavoidable, because the two things that can go wrong — the agent didn't deliver, or the customer refuses at the door (COD failure mode, §2.4) — both land on Soko to adjudicate if it's the one holding the funds.

### 3.4 What Soko charges, and to whom

Not researchable from public sources (no aggregator publishes a rate card that includes marketplace-commission economics) — this is a business decision, not a finding. What the research does establish: the aggregator itself takes its cut off the top (the ~1.5–3% mobile money fee, §2.2, indicative only), and **Soko's own commission is a separate line the marketplace has to define and disclose**, distinct from the aggregator's processing fee. The two should never be conflated in the data model or in what's shown to the customer — a customer who sees one number can't tell whether they're being charged a processing fee, a delivery fee, or a marketplace commission, and any dispute investigation later needs them separable.

### 3.5 What `OrderRequest` would need to carry

Concretely, extending `src/lib/order.ts`'s `OrderRequest` interface (line 290) for a real transaction, in the order the sequence above implies:

- **`status`** — a real state machine: `requested → confirmed → payment_pending → paid → dispatched → delivered → completed` plus `disputed`/`refunded` branches. Today there is no status at all; the record's existence *is* its only state.
- **`serverOrderId`** — a durable, server-issued ID distinct from `reference`. `reference` should stay as the human-readable phone-call code it already is; it should stop being the only identifier once a backend exists, because it's generated client-side with no collision guarantee against a real database.
- **`payment`** block: `method` (`mobile_money | card | cash_on_delivery`), `provider`/`aggregatorTxnRef` (the aggregator's own transaction ID — required for reconciliation, and not the same thing as `reference`), `payerPhone` (may legitimately differ from `customer.phone` — the person paying isn't always the person receiving), `amountRequestedTZS`, `amountPaidTZS`, `paidAt`.
- **Amount breakdown**, not a single `lineTotalTZS`: `itemsTotalTZS`, `deliveryFeeTZS`, `platformCommissionTZS`, `aggregatorFeeTZS` — each attributable to whoever charges it, so a dispute can be resolved against the right party.
- **`payee`** — which real-world account the held/collected funds are ultimately remitted to. This differs by route (§3.3): the brand's branch account on a brand route; a split between the brand and the agent on an agent route. Nothing in the current `OrderRouteRecord` (line 281) carries a payout destination — it only carries who *delivers*, not who gets *paid*.
- **`deliveryConfirmation`** — who confirmed (customer, agent, or branch), when, and by what means (PIN, photo, signature). This is the event that should gate fund release under the Step 3 escrow model, and it doesn't exist anywhere in the current record.
- **`disputeStatus`** — open/none/resolved, plus a free-text reason — the minimum a marketplace needs before it can honestly hold anyone's money.

## 4. Where I was wrong

- **I assumed Tanzania's mobile money market looks like Kenya's** — a single dominant wallet (M-Pesa) with everything else marginal. Every source that discussed market structure was explicit that Tanzania is genuinely three/four-way split (M-Pesa, Tigo Pesa/Mixx, Airtel Money, HaloPesa), which changes the integration story: a Tanzania-first product cannot get away with "just support M-Pesa" the way a Kenya-first one might. This is the single most consequential correction in this document — it's the reason an aggregator, not a single telco integration, is the right architecture from day one.
- **I assumed "getting a payment licence" would be a meaningful line item on Soko's roadmap.** Reading the actual Act text showed the licensing burden (three separate licensable activities under NPSA ss.5/15/24) falls on whoever *operates the payment system or issues e-money* — the aggregator — not on a merchant using one. Soko's regulatory posture is closer to "sign an aggregator's merchant agreement and pass KYC" than "apply to the Bank of Tanzania." I had this backwards going in.
- **The Bank of Tanzania's own website was the weakest source in this document, not the strongest.** I expected the regulator's site to be the best place to confirm licensing detail; the mandate page I fetched was general and non-specific, and the actual granular detail came from a legal-summary site and, better, from a third-party site quoting the statute's section numbers directly. Worth remembering for anyone extending this research: `tanzanialaws.com`'s rendering of the Act text was more useful than BOT's own supervision page.

## What I could NOT verify

- **Any current, official fee schedule.** Every percentage in this document (mobile money ~1.5–3%, cards ~2.5–6%, payout fees TZS 500–2,000) comes from aggregator-comparison/SEO content (PayAtlas, ClickPesa's own guide), not a rate card from BOT, Selcom, Azampay, or a telco. Treat all figures as directional only.
- **The BOT notice on "restriction on issuance of electronic money licences"** referenced in a Lexology piece — the fetch 403'd and I did not incorporate any claim about its content. If this notice is real and current, it could materially change §2.3 (e.g., a moratorium on new e-money issuer licences would reinforce the aggregator-not-licensee posture even harder, or could constrain which aggregators are even accepting new merchants) — **this is a genuine gap, not a settled "no effect."**
- **Interoperability mechanics between M-Pesa/Tigo Pesa/Airtel Money** (whether via a BOT-run switch, bilateral agreements, or something else) — mentioned in secondary sources, not confirmed against a BOT primary source.
- **HaloPesa's (Halotel's) aggregator/API coverage** — essentially absent from every source I found, despite Halotel being one of Soko's six brands. Worth a targeted follow-up before building anything Halotel-specific.
- **Actual merchant onboarding steps and documentation checklist** for Selcom/Azampay/ClickPesa/Pesapal — their public sites don't publish this; it would require contacting them directly or finding their developer-portal docs (behind sign-up, likely), which I did not attempt.
- **VAT/turnover threshold (~TZS 100M) and any Tanzania Revenue Authority-specific commerce rules** — sourced from PayAtlas only, not TRA directly.
