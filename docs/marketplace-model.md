# The marketplace model — how Soko makes money

Owner: the founder. Drafted 2026-08-23 from a design conversation, and it records
**decisions and open questions**, not built code. Nothing in "What to build" exists yet.

Read `docs/research/commerce-and-payments.md` first — Ledger's Phase 0 research is the
evidence base under most of this, including the finding that Soko does **not** need a
Bank of Tanzania licence.

---

## 1. What Soko actually is

Soko is a **shop window for the whole city**. The shops and the couriers already exist
as real businesses out in Dar es Salaam, Arusha, Mwanza and Dodoma. They do not sign
themselves up on the customer-facing site.

But they *are* partners, not scraped listings. The signup desk simply lives off the
website:

1. A branch or a courier **applies externally**.
2. **Soko's admin approves them** and creates their account.
3. A branch **submits products**, which land in an admin review queue.
4. Admin **publishes** them, and only then do they appear to customers.
5. A customer orders, and the order **goes back to the exact branch that listed it**.

That last step is what makes this a marketplace rather than a directory, and it is the
single fact the whole revenue model rests on: **Soko knows the sale happened**, so Soko
can charge for it. A pure directory could never enforce a commission.

### The three phases

```
   PHASE 1                    PHASE 2                      PHASE 3
   ───────                    ───────                      ───────

   Brand branch    ──────▶    Carrier            ──────▶   Customer
   (owns the goods)           │                            (receives, pays
   confirms the order         ├─ the brand's own fleet      the rest at the door)
                              │  branch.deliveryOffered
                              │  = true  · 6 of 19
                              │
                              └─ a local courier
                                 resolveDeliveryRoute()
                                 picks by city · 13 of 19
```

Phase 2 is the product. `resolveDeliveryRoute()` in `src/lib/order.ts` already decides
it, and it is four lines long.

---

## 2. The money loop

### The platform fee is a ladder on the goods, not a percentage

**Superseded 2026-08-23**: the original 6% on goods / 5% on delivery is gone. A single
percentage cannot serve this catalogue — it runs from a **TZS 2,000 item to a TZS
245,000,000 SUV, a spread of 122,500×**. At 6%, the small item yields 120 TZS (less than
it costs to process) and the SUV yields 14,700,000 TZS (no dealer in Dar would accept
that). Twelve products sit under 100K and eighteen above 10M, so both ends are real.

The ladder applies to the **goods payment only**, and the customer pays it as the deposit.

| Goods payment (TZS) | Platform fee | Rate at top of band |
|---|---|---|
| 1,000 – 5,000 | **500** | 10.00% |
| 5,100 – 10,000 | **1,000** | 10.00% |
| 10,100 – 25,000 | **2,000** | 8.00% |
| 25,100 – 50,000 | **3,500** | 7.00% |
| 50,100 – 100,000 | **6,000** | 6.00% |
| 100,100 – 250,000 | **9,000** | 3.60% |
| 250,100 – 500,000 | **14,000** | 2.80% |
| 500,100 – 1,000,000 | **19,000** | 1.90% |
| 1,000,100 – 5,000,000 | **26,000** | 0.52% |
| 5,000,100 – 20,000,000 | **32,000** | 0.16% |
| 20,000,100 – 100,000,000 | **36,000** | 0.04% |
| above 100,000,000 | **40,000** (cap) | 0.016% at 245M |

The first two rungs are the founder's own, unchanged. **The rest deliberately flatten to
a 40,000 ceiling.** A ladder whose steps keep the same slope is just a flat percentage
wearing a staircase costume — extending 500-per-5,000 all the way up gives a constant 10%
and a 24,500,000 TZS fee on the SUV, worse than the 6% it replaces.

> **What the 40,000 cap means for the business — read this before changing it.**
> On this catalogue the cap cuts fee revenue by **95%**: if all 38 products sold once, a
> 1,200,000 ceiling earns 17,701,500 TZS and this one earns 898,500. That is not a
> mistake, it is a change of business model. Soko stops being a **commission** business
> (revenue scales with order value) and becomes a **transaction-fee** business (revenue
> scales with order *count*). A car sale earns 40,000 TZS — about seven earbud sales.
> The upside is the reason to do it: at 0.016%, Toyota and BMW have no commercial reason
> to refuse to list, where a 14,700,000 commission would have ended the conversation.
> It is land-grab pricing, and it makes **volume the whole game**.

> **Watch the bottom rung.** The cheapest product in the catalogue is TZS 2,000, and a
> 500 TZS fee on it is **25%**. Either accept that small items are disproportionately
> taxed, add a narrower first rung, or set a minimum order value. Owner's call.

### Delivery is priced by Soko per city, and billed to the courier

**Decided 2026-08-23.** Soko sets the delivery fee — not the courier, not the branch — as
a flat number per city: Dar es Salaam, Arusha, Mwanza, Dodoma. Four numbers Soko controls,
quotable upfront, and it is all the current data can support (branch coordinates are
approximate city-centre points, so nothing finer than city is real yet).

The customer pays the delivery fee to the courier at the door. **Soko's cut comes from the
courier afterwards**, accruing on their partner page:

| Delivery fee charged | Soko takes, per delivery | Note |
|---|---|---|
| Up to 3,000 (in-city hops) | **500** | Billed as **5,000 per 10 deliveries** — a settlement cadence, not a different rate |
| 3,001 – 25,000 | **1,500** | |
| Above 25,000 | **2,500** | |

**This supersedes the flat 1,000 TZS off-platform fee.** That fee existed to answer "what
does Soko earn when the delivery money never passes through it" — and under this scheme
delivery money never passes through Soko for anyone, so the distinction has no work left
to do. Charging both would mean a courier owing 1,500 on a 3,000 shilling job. If the
intent was a penalty for taking payment outside Soko, it needs restating as one.

> **The structural cost of this choice.** Goods revenue is secured before anything
> happens; **delivery revenue is now a receivable.** On the worked examples below it is
> 6–8% of what Soko earns per order, so the exposure is small — but it is credit, and it
> makes the enforcement lever load-bearing rather than theoretical.

### The deposit is the goods rung, and nothing else

The customer pays a deposit at order time by mobile money equal to **the goods rung —
nothing more**. Everything after that is settled at the door, in cash or direct mobile
money, between the customer, the branch and the courier. Soko never touches it.

Worked example — a fridge at TZS 1,000,000, delivered in Dar es Salaam for TZS 15,000:

```
  Customer pays now (deposit)     19,000   the 500,100–1,000,000 goods rung
  Customer pays at the door      996,000
                               ─────────
  Order total                  1,015,000

  Of the 996,000 at the door:
    branch keeps                981,000   (1,000,000 less its 19,000 rung)
    courier collects             15,000   (the full delivery fee)
                               ─────────
                                996,000   ✓ exact

  Afterwards, on the courier's partner page:
    courier owes Soko             1,500   (the 3,001–25,000 rung), netting 13,500

  Soko earns 20,500 — 93% of it secured before anyone moved.
```

The same arithmetic across the catalogue's real range:

| Order | Deposit (secured) | Courier owes | Soko earns | Share secured |
|---|---|---|---|---|
| Earbuds 65,000 + 2,500 delivery | 6,000 | 500 | 6,500 | 92% |
| Fridge 1,000,000 + 15,000 | 19,000 | 1,500 | 20,500 | 93% |
| SUV 245,000,000 + 40,000 | 40,000 | 2,500 | 42,500 | 94% |

Every row reconciles exactly: what the branch keeps plus what the courier collects always
sums to the cash taken at the door, with nothing left over.

**Why this shape and not escrow.** If Soko collected the full 1,015,000 and paid the
others out later, Soko would be holding other people's money — which brings refunds,
disputes, reconciliation, float, and a much heavier regulatory posture. Taking only the
goods rung upfront means:

- Soko is **paid before it does anything**, and never has to chase a branch.
- Soko is a **merchant of an aggregator** (Selcom / Azampay), not a payment operator —
  no BOT licence, per the National Payment Systems Act reading in the research.
- Cash on delivery, which still dominates the market, keeps working untouched.
- The deposit doubles as the **low-intent filter** the research says the industry uses:
  someone who will not send 19,000 was never going to accept the fridge.

### The courier ledger, and the real lever

Every delivery accrues its rung to the courier's account, and they settle it on the page
they registered on.

The enforcement lever is not invoicing, it is **job allocation**: a courier with an
overdue balance stops being offered by `resolveDeliveryRoute()`. That has to be a stated
rule with a grace period, visible on their page, or it will read as arbitrary.

> **Open — owner's call.** The grace period (how many deliveries or days before
> suspension), whether a suspended courier's accepted jobs still complete, and whether a
> courier who stops at 7 in-city deliveries owes 3,500 or nothing. This document assumes
> **accrual** — they owe 3,500, and "per 10" is only when Soko asks for it.

### Refunds

The deposit is Soko's revenue, taken before anyone has done anything, so the failure
cases need a stated policy:

| What happens | Proposal |
|---|---|
| Branch declines — out of stock, price wrong | **Full refund.** Soko did not deliver a customer; keeping it would be indefensible. |
| Customer cancels before dispatch | **Full refund** within a short window, then non-refundable. |
| Customer refuses at the door | **Non-refundable.** This is the exact behaviour the deposit exists to discourage, and a driver has already made the trip. |
| Courier fails to deliver | **Full refund**, and it counts against the courier. |

> **Open — owner's call.** The cancellation window, and whether a refused delivery also
> bills the customer for the wasted trip.

---

## 3. What this changes about decisions already recorded

Three existing decisions are affected. None should be quietly overwritten — each is
written down somewhere and someone will trust it.

**Orders belong in Prisma, not Firestore.** `docs/backend.md` scopes Firestore to
"genuinely user-scoped, realtime-shaped" data with no joins, which is why saved order
requests went there. A real order is the opposite: it joins a product, a branch, a
courier, a customer and a payment, and admin and partners must query across customers.
So orders go in Prisma, and **the existing Firestore saved-requests feature is
superseded** — its data migrates and Firestore reverts to Auth and Analytics only.
That is a change to decision #14 and belongs in `docs/backend.md` with its reasoning.

> **Done, and then overtaken.** Orders became a real `Order` table on 2026-08-25, for
> the reason argued here. The second half went further than this paragraph asked: on
> 2026-08-28 Firebase was removed from the repo altogether — Auth is Supabase, Analytics
> and App Check are gone with no replacement, and saved order requests are a
> `SavedOrderRequest` table rather than data waiting to migrate. So Firestore did not
> "revert to Auth and Analytics only"; there is no Firestore, and the identity that made
> a separate store defensible now lives in the same Postgres as everything else. Both
> reversals are recorded in `docs/backend.md` under the decisions they overturn.

**Debt #8 closes as a side effect.** The register says the `src/data` arrays and the
database are two sources of one truth, "fully resolved when Phase 2 reverses the
direction and retires the seed's prune". The admin publish flow *is* that reversal: once
branches submit products and admin publishes them, **the database becomes the source of
truth** and `src/data` becomes seed/demo fixtures only.

**Debt #20 and #21 change shape.** Customer PII retention and the save-action rate limit
were scoped to Firestore saved requests. When orders move to Prisma they need answering
again in the new place — the retention question does not go away, it moves.

> **It moved, and one of them lost its answer.** Both now sit against Postgres tables.
> Retention (#20) is unchanged and still unanswered: it is the owner's number, and no TTL
> or purge is built. The rate limit (#21) got worse rather than better — the fix on the
> register was App Check enforcement plus a per-uid limit, and App Check went with
> Firebase, so the only half that existed is the half that is gone. The 200-per-customer
> ceiling still bounds total damage and still does nothing about burst rate.

---

## 4. What to build, in order

Each phase is shippable on its own. Do not start a later one early: every phase after
the first is dishonest without the order being a real, durable record.

### Phase 1 — Make the order real *(prerequisite for everything)*

Today `createOrderRequest()` builds the order **in the browser**, stores it in
`sessionStorage`, and sends it nowhere. The confirmation screen says so in plain words.
Nothing below is honest until this changes.

- Prisma models: `Order`, `OrderEvent` (an append-only status history), and a payment
  block. Keep `reference` as the human code read down the phone; add a real server id.
- A status machine, explicit and tested:
  `requested → confirmed → deposit_paid → dispatched → delivered → completed`,
  with `declined`, `cancelled`, `refunded` branches.
- The server re-derives every number from the catalogue, exactly as
  `buildOrderRequest()` in `src/server/orders/saved-requests.ts` already does. The
  browser says *which product* and *who to*, never a price.
- Migrate the Firestore saved requests, then retire that path. *(Done 2026-08-28 —
  `SavedOrderRequest`, migration `20260828000000_saved_order_requests`. Firestore was
  not migrated away from and left running; it was removed.)*

### Phase 2 — Partners and admin *(the founder's stated first priority)*

- `Partner` (type `BRANCH` | `AGENT`, status `applied` / `approved` / `suspended`),
  linked to the existing `Branch` or `DeliveryAgent` rows.
- `PartnerUser` mapping a Supabase user id to a partner. **Accounts are created by admin
  after the external application — there is no self-serve signup.**
- An `admin` role as `app_metadata.admin === true`, checked in `src/server/auth/dal.ts`.
  Authorization stays in the DAL, next to the data — the repo has already rejected a
  proxy as the only line of defence, and that reasoning holds here. It must be
  `app_metadata` and never `user_metadata`: the second is writable by the account holder,
  so an admin check against it is a self-service promotion. `SOKO_ADMIN_EMAILS` is the
  bootstrap allowlist, because nothing in the app should be able to mint the first admin.
- `ProductSubmission` model plus `/admin`: approve partners, review submissions,
  publish. Publishing writes the live `Product` row.
- `/partner`: a branch submits products and sees its own orders; a courier sees its
  deliveries and its outstanding balance.

### Phase 3 — Money

- **Owner action, not code:** a merchant account with one aggregator (Selcom or Azampay
  are the concrete Tanzania-headquartered candidates). Soko is their merchant; they hold
  the licence.
- A **pure fee module** — goods total and delivery fee in; goods rung, delivery rung,
  deposit, branch payout and courier payout out. Pure and heavily tested, in the shape of
  `buildListings` / `previewDelivery`. Money bugs are the worst kind, and a pure function
  is the only part worth trusting. **Both ladders are data, not code** — a fee table a
  non-engineer can change without a deploy, because these numbers have already changed
  twice in one conversation.
- Integer TZS throughout — the schema already uses `priceTZS Int`. Band edges are exact,
  so there is no rounding in the fee itself; the only rounding question is inside the
  aggregator's own charge.
- Deposit collection: a mobile-money push to the phone already captured in
  `customer.phone`, reconciled against the aggregator's own transaction id — which is
  *not* the same thing as `reference`.
- `AgentLedger`: accrue the delivery rung per delivery, settle on the partner page,
  suspend from routing when overdue.

### Phase 4 — Settlement and trust

- Per-partner statements: what was ordered, what Soko took, what is outstanding.
- Delivery confirmation (a PIN or code against the reference), which is also the
  evidence a dispute is decided on.
- Dispute and refund handling against the policy in §2.

---

## 5. Open questions the owner still has to answer

1. **Refund policy** — the cancellation window, and who bears a refused delivery.
2. **Courier suspension** — grace period before an overdue balance stops job allocation,
   and whether a partial batch of in-city deliveries is owed pro-rata.
3. **Who verifies a branch is really that brand?** Nothing stops someone applying as
   "Toyota Arusha". The `verified` flag already separates researched fact from
   placeholder; partner approval needs the same discipline, and it is an ops process,
   not a code change.
4. **The bottom rung.** A 500 TZS fee on the TZS 2,000 item is 25%. Accept it, add a
   narrower first rung, or set a minimum order value.
5. **Does the deposit apply to brand-fleet orders?** No courier means no delivery rung,
   so the deposit is the goods rung alone and Soko earns nothing from the delivery leg —
   confirm that is intended for 6 of 19 branches.
6. **Weight or size surcharge on delivery**, once `Product` can carry it. Today an SUV and
   a pair of earbuds are quoted the same delivery fee.
7. **Was the 1,000 TZS meant as a penalty?** It is superseded here. If the intent was to
   discourage taking payment outside Soko, it needs restating as a surcharge on top of
   the delivery rung rather than an alternative to it.

---

## 6. Verification, when this gets built

- **Fee module**: unit tests over the real catalogue's price range — TZS 2,000 to TZS
  245,000,000 — asserting that the deposit plus the door payment reconciles to the order
  total exactly, and that what the branch keeps plus what the courier collects equals the
  door payment, for both route kinds. Test the band edges specifically: 5,000 and 5,100
  must differ, 100,000,000 and 100,000,001 must not.
- **Status machine**: tests that illegal transitions are rejected, not just that legal
  ones work.
- **Authorization**: E2E proving a branch cannot see another branch's orders, and a
  courier cannot see any branch's, in the shape of
  `src/server/orders/saved-requests.integration.test.ts` — the cross-customer isolation
  suite that replaced `src/security/firestore-rules.test.ts` when Firebase was removed,
  and which asserts the same property against real Postgres instead of an emulator. Both
  directions, by injecting the mistake and watching the suite fail.
- **The whole loop**: place an order as a customer, receive it as the branch, deliver it
  as the courier, and check the ledger says what §2 says it should.
- And the standing rule: **open the page and use it.** Two bugs escaped the entire test
  suite already and were caught by a human clicking.
