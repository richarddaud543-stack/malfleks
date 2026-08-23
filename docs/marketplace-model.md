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

### The platform fee is a ladder, not a percentage

**Superseded 2026-08-23**: the original 6% on goods / 5% on delivery is gone. A single
percentage cannot serve this catalogue — it runs from a **TZS 2,000 item to a TZS
245,000,000 SUV, a spread of 122,500×**. At 6%, the small item yields 120 TZS (less than
it costs to process) and the SUV yields 14,700,000 TZS (no dealer in Dar would accept
that). Twelve products sit under 100K and eighteen sit above 10M, so both ends are real.

Instead: **one ladder, applied to any payment that passes through Soko** — the goods
payment and the delivery payment alike.

| Payment amount (TZS) | Platform fee | Rate at top of band |
|---|---|---|
| 1,000 – 5,000 | **500** | 10.0% |
| 5,100 – 10,000 | **1,000** | 10.0% |
| 10,100 – 25,000 | **2,000** | 8.0% |
| 25,100 – 50,000 | **3,500** | 7.0% |
| 50,100 – 100,000 | **6,000** | 6.0% |
| 100,100 – 250,000 | **12,000** | 4.8% |
| 250,100 – 500,000 | **20,000** | 4.0% |
| 500,100 – 1,000,000 | **32,000** | 3.2% |
| 1,000,100 – 5,000,000 | **90,000** | 1.8% |
| 5,000,100 – 20,000,000 | **250,000** | 1.3% |
| 20,000,100 – 100,000,000 | **650,000** | 0.7% |
| above 100,000,000 | **1,200,000** (cap) | — |

The first two rungs are the founder's own, unchanged. **The rest deliberately flatten.**
That is the whole point: a ladder whose steps keep the same slope is just a flat
percentage wearing a staircase costume — extending 500-per-5,000 all the way up gives a
constant 10% and a 24,500,000 TZS fee on the SUV, which is worse than the 6% it replaces.

Plus, unchanged: **1,000 TZS flat per delivery**, owed by a courier who takes payment
outside Soko, settled on their own partner page.

> **Watch the bottom rung.** The cheapest product in the catalogue is TZS 2,000, and a
> 500 TZS fee on it is **25%**. Either accept that small items are disproportionately
> taxed, add a narrower first rung, or set a minimum order value. Owner's call.

### Delivery is priced by Soko, per city

**Decided 2026-08-23.** Soko sets the delivery fee — not the courier, not the branch — as
a flat number per city: Dar es Salaam, Arusha, Mwanza, Dodoma. Four numbers Soko controls,
quotable upfront and honest, and it is all the current data can support (branch
coordinates are approximate city-centre points, so nothing finer than city is real yet).

This closes the hole flagged in the previous draft, where Soko took a percentage of a
number nobody had defined.

> **Open — later, not now.** A size or weight surcharge. A TZS 245M SUV and a pair of
> earbuds are currently quoted the same delivery, which is obviously wrong; fixing it
> needs a weight or size field on `Product` that does not exist.

### The deposit is exactly Soko's cut

This is the load-bearing decision. The customer pays a deposit at order time by mobile
money, and that deposit **equals Soko's total commission — nothing more**. Everything
after that is settled at the door, in cash or direct mobile money, between the customer,
the branch and the courier. Soko never touches it.

Worked example — a fridge at TZS 1,000,000, delivered in Dar es Salaam for TZS 15,000:

```
  Customer pays now (deposit)     34,000   = 32,000 goods rung + 2,000 delivery rung
  Customer pays at the door      981,000
                               ─────────
  Order total                  1,015,000

  Of the 981,000 at the door:
    courier keeps                13,000   (15,000 less its 2,000 rung)
    branch keeps                968,000   (1,000,000 less its 32,000 rung)
                               ─────────
                                981,000   ✓ exact
```

The same arithmetic across the catalogue's real range — note that Soko's share of the
order **falls as the order grows**, which is the ladder doing its job:

| Order | Deposit (Soko earns) | At the door | Soko's share |
|---|---|---|---|
| Earbuds 65,000 + 8,000 delivery | 7,000 | 66,000 | 9.59% |
| Fridge 1,000,000 + 15,000 | 34,000 | 981,000 | 3.35% |
| SUV 245,000,000 + 15,000 | 1,202,000 | 243,813,000 | 0.49% |

Every row reconciles exactly: what the branch and courier keep always sums to the cash
collected at the door, with nothing left over and nothing to chase.

**Why this shape and not escrow.** If Soko collected the full 1,015,000 and paid the
others out later, Soko would be holding other people's money — which brings refunds,
disputes, reconciliation, float, and a much heavier regulatory posture. Taking only the
commission upfront means:

- Soko is **paid before it does anything**, and never has to chase a branch or a courier.
- Soko is a **merchant of an aggregator** (Selcom / Azampay), not a payment operator —
  no BOT licence, per the National Payment Systems Act reading in the research.
- Cash on delivery, which still dominates the market, keeps working untouched.
- The deposit doubles as the **low-intent filter** the research says the industry uses:
  someone who will not send 34,000 was never going to accept the fridge.

### The 1,000 TZS, and how it is actually collected

When a courier takes payment **outside** Soko, no delivery payment passes through it, so
no rung is charged and Soko earns nothing from the leg it arranged. A flat **1,000 TZS per
delivery** accrues to that courier's account instead, settled on their own partner page.

The enforcement lever is not invoicing, it is **job allocation**: a courier with an
overdue balance stops being offered by `resolveDeliveryRoute()`. That has to be a stated
rule with a grace period, visible on their page, or it will read as arbitrary.

> **Open — owner's call.** The grace period (how many deliveries or days before
> suspension), and whether a suspended courier's existing accepted jobs still complete.

### Refunds

The deposit is Soko's revenue, taken before anyone has done anything, so the failure
cases need a stated policy:

| What happens | Proposal |
|---|---|
| Branch declines — out of stock, price wrong | **Full refund.** Soko did not deliver a customer; keeping it would be indefensible. |
| Customer cancels before dispatch | **Full refund** within a short window, then non-refundable. |
| Customer refuses at the door | **Non-refundable.** This is the exact behaviour the deposit exists to discourage, and a driver has already been paid for the trip. |
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

**Debt #8 closes as a side effect.** The register says the `src/data` arrays and the
database are two sources of one truth, "fully resolved when Phase 2 reverses the
direction and retires the seed's prune". The admin publish flow *is* that reversal: once
branches submit products and admin publishes them, **the database becomes the source of
truth** and `src/data` becomes seed/demo fixtures only.

**Debt #20 and #21 change shape.** Customer PII retention and the save-action rate limit
were scoped to Firestore saved requests. When orders move to Prisma they need answering
again in the new place — the retention question does not go away, it moves.

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
- Migrate the Firestore saved requests, then retire that path.

### Phase 2 — Partners and admin *(the founder's stated first priority)*

- `Partner` (type `BRANCH` | `AGENT`, status `applied` / `approved` / `suspended`),
  linked to the existing `Branch` or `DeliveryAgent` rows.
- `PartnerUser` mapping a Firebase uid to a partner. **Accounts are created by admin
  after the external application — there is no self-serve signup.**
- An `admin` role as a Firebase custom claim, checked in `src/server/auth/dal.ts`.
  Authorization stays in the DAL, next to the data — the repo has already rejected a
  proxy as the only line of defence, and that reasoning holds here.
- `ProductSubmission` model plus `/admin`: approve partners, review submissions,
  publish. Publishing writes the live `Product` row.
- `/partner`: a branch submits products and sees its own orders; a courier sees its
  deliveries and its outstanding balance.

### Phase 3 — Money

- **Owner action, not code:** a merchant account with one aggregator (Selcom or Azampay
  are the concrete Tanzania-headquartered candidates). Soko is their merchant; they hold
  the licence.
- A **pure fee module** — goods total, delivery fee and route kind in; deposit, branch
  payout, courier payout and Soko's cut out. Pure and heavily tested, in the shape of
  `buildListings` / `previewDelivery`. Money bugs are the worst kind, and a pure function
  is the only part worth trusting.
- Integer TZS throughout — the schema already uses `priceTZS Int`. **Define the rounding
  rule explicitly** (proposal: round Soko's cut down to the nearest TZS, so the customer
  is never overcharged by rounding).
- Deposit collection: a mobile-money push to the phone already captured in
  `customer.phone`, reconciled against the aggregator's own transaction id — which is
  *not* the same thing as `reference`.
- `AgentLedger`: accrue 1,000 TZS per off-platform delivery, settle on the partner page,
  suspend from routing when overdue.

### Phase 4 — Settlement and trust

- Per-partner statements: what was ordered, what Soko took, what is outstanding.
- Delivery confirmation (a PIN or code against the reference), which is also the
  evidence a dispute is decided on.
- Dispute and refund handling against the policy in §2.

---

## 5. Open questions the owner still has to answer

1. **Refund policy** — the cancellation window, and who bears a refused delivery.
2. **Courier suspension** — grace period before an overdue balance stops job allocation.
3. **Who verifies a branch is really that brand?** Nothing stops someone applying as
   "Toyota Arusha". The `verified` flag already separates researched fact from
   placeholder; partner approval needs the same discipline, and it is an ops process,
   not a code change.
4. **The bottom rung.** A 500 TZS fee on the TZS 2,000 item is 25%. Accept it, add a
   narrower first rung, or set a minimum order value.
5. **Does the deposit apply to brand-fleet orders?** No courier means no delivery payment
   through Soko and no delivery rung, so the deposit would be the goods rung alone —
   confirm that is intended.
6. **Weight or size surcharge on delivery**, once `Product` can carry it. Today an SUV and
   a pair of earbuds are quoted the same delivery fee.

---

## 6. Verification, when this gets built

- **Fee module**: unit tests over the real catalogue's price range — TZS 32,000 earbuds
  to TZS 245,000,000 SUVs — asserting that deposit + door payment reconciles to the
  order total exactly, with no rounding leak, for both route kinds.
- **Status machine**: tests that illegal transitions are rejected, not just that legal
  ones work.
- **Authorization**: E2E proving a branch cannot see another branch's orders, and a
  courier cannot see any branch's, in the shape of the existing
  `src/security/firestore-rules.test.ts` — both directions, by injecting the mistake and
  watching the suite fail.
- **The whole loop**: place an order as a customer, receive it as the branch, deliver it
  as the courier, and check the ledger says what §2 says it should.
- And the standing rule: **open the page and use it.** Two bugs escaped the entire test
  suite already and were caught by a human clicking.
