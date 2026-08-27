# Round 2026-08-27 — the go-live round

Eight assignments, one per engineer. This is everything engineering can do toward a live
platform **without a deploy target and without the owner making a decision first**.

Issued by the Engineering Lead, 2026-08-27, against the gap analysis of the same date:
34 items stand between the repo and a live platform. These briefs cover 21 of them. The
rest are listed at the bottom, because they are not engineering's to close.

---

## How to run one

Each brief is self-contained — a cold engineer with no memory of the last assignment can
execute it from the file alone, which is the standing requirement for a brief in this
project. From a Claude Code session in the repo root:

```
Read docs/assignments/forge-09.md and execute it as ENG-4 · Forge.
```

**Run at most two at a time.** Subagents share the account's session budget, and on
2026-08-23 two parallel agents were killed mid-assignment by a session limit — one had
reported and its work survived, the other left half-finished files on disk. Fewer, larger,
well-briefed assignments beat many small ones.

**The Lead is the only writer to `master`.** No engineer runs a git command that changes
state. Branches land one at a time, on arrival, never batched — every branch in the
2026-08-14 round needed Lead work to be shippable and none of it showed up inside the
branch. It was all seam damage.

---

## The waves

Sequenced by file ownership, so that nothing in a wave touches a file another engineer in
the same wave holds.

### Wave 1 — five parallel, disjoint file sets

| Brief | Engineer | What it closes |
|---|---|---|
| [`forge-09.md`](forge-09.md) | ENG-4 · Forge | Postgres proven, `OrderEvent`, partner→catalogue link, `ProductSubmission`, partner-scoped orders |
| [`ledger-03.md`](ledger-03.md) | ENG-8 · Ledger | The fee module — both ladders as editable data behind a pure, exhaustively tested function |
| [`vault-05.md`](vault-05.md) | ENG-7 · Vault | Rate limit (#21), retention mechanism (#20), App Check runbook (#16) |
| [`beacon-04.md`](beacon-04.md) | ENG-5 · Beacon | The honesty pass — copy that went false on 25 Aug — plus IA for the new routes |
| [`prism-05.md`](prism-05.md) | ENG-6 · Prism | Status tokens for seven states, the brand-logo licensing audit, photography plan (#5) |

### Wave 2 — after wave 1 lands

| Brief | Engineer | Waits on |
|---|---|---|
| [`atlas-11.md`](atlas-11.md) | ENG-1 · Atlas | Forge's models, Prism's tokens, Beacon's route contract |
| [`mercury-06.md`](mercury-06.md) | ENG-2 · Mercury | Forge — it changes catalogue row counts and the seed must follow |

### Wave 3 — last

| Brief | Engineer | Waits on |
|---|---|---|
| [`sentinel-07.md`](sentinel-07.md) | ENG-3 · Sentinel | Everything. Mutation testing, authorization E2E, the full lifecycle |

---

## Who holds what

The seam that has broken before is two engineers in one file. This round's ownership map:

| Path | Owner |
|---|---|
| `prisma/**`, `src/server/db|orders|partners/**` | Forge |
| `src/server/auth/**`, `firestore.rules`, `docs/auth.md` | Vault |
| `src/lib/fees/**` | Ledger |
| `src/data/**` *(branch, courier, coordinate sections of `SOURCES.md`)* | Mercury |
| `src/app/globals.css`, `src/lib/accent.ts`, *(imagery/logo sections of `SOURCES.md`)* | Prism |
| `src/app/partner/**`, `src/components/partner/**`, `src/app/admin/**` | Atlas |
| `sitemap.ts`, `robots.ts`, `metadata` blocks, customer-facing copy | Beacon |
| `e2e/**`, test configs | Sentinel |

Two shared files, flagged in both briefs: **`src/data/SOURCES.md`** (Mercury and Prism, in
separate sections) and **`src/app/actions/orders.ts`** (Vault adds the rate-limit guard;
Forge does not touch it this round).

---

## The rule this round runs on

Nine decisions are yours, not engineering's, and none of them blocks a brief. Every one has
been turned into **configuration with a stated default**, so the machine gets built and you
supply the number whenever you are ready:

| Decision | What ships meanwhile |
|---|---|
| The 25% bottom rung | The ladder as written, in an editable table |
| Deposit on brand-fleet orders | Goods rung only, no delivery rung |
| Weight/size surcharge | None — `Product` cannot carry weight yet |
| PII retention period | `RETENTION_DAYS = null` — never expires, today's behaviour exactly |
| The four per-city delivery fees | Table entries present but **unset**, and a quote against an unset city fails loudly rather than returning zero |

No engineer invents a policy number. A number invented by an engineer reads as policy to
whoever finds it next — that reasoning is already in the debt register and it still holds.

Mercury will hand you a **directional recommendation** for the four delivery fees, based on
what couriers actually charge in each city. Ledger will tell you whether an aggregator fee
floor makes the bottom rung an arithmetic question rather than a policy one.

---

## What these briefs do not close — and cannot

Thirteen items, all of them yours:

**Needs your account or your card**

1. **A git remote** (debt #2). Everything is on one disk, 44 commits, never pushed. This
   also blocks CI (#1) from ever running and gates mutation testing's value. **It is the
   single highest-leverage thing you can do, and it takes ten minutes.**
2. **A deploy target** — hosting and a domain. Forge proves Postgres works this round;
   somewhere to run it is yours.
3. **A Firebase Admin service-account key.** `createSessionCookie`, `verifySessionCookie`
   and the Firestore write have *never* been verified against a live project — the largest
   untested seam in the codebase, and no engineer may hold that key.
4. **App Check enforcement.** Vault writes the runbook; the click is yours.
5. **An aggregator merchant account** (Selcom or Azampay). Ledger will tell you what they
   require.

**Needs a commercial conversation**

6. **Brand distribution or reseller agreements** for Toyota, Ford, BMW, Oraimo, Apple and
   Halotel. Every logo on the site is a trademark used under nominative fair use. Prism
   costs the fallback if a brand says no.
7. **Real product photography**, or a decision to keep the icon set. Prism gives you both
   options with what each costs.
8. **Committed delivery windows** from the six brand-fleet branches. Nothing invents one
   today, and that is the correct behaviour until a brand supplies one.

**Needs a decision, once the recommendations arrive**

9. The four per-city delivery fees.
10. The retention period.
11. The bottom rung.
12. Refund window, and who bears a refused delivery.
13. Courier grace period before an overdue balance stops job allocation.

---

## What is deliberately not in this round

**Payments.** No aggregator integration, no deposit collection, no customer-facing amount.
Ledger builds the arithmetic and is explicitly barred from any customer surface; Sentinel
asserts that as a test rather than trusting it as a policy.

The reason is the one already written into `docs/marketplace-model.md`: *every phase after
the first is dishonest without the order being a real, durable record*. The order became
real on 2026-08-25. Money is the next round — after there is somewhere to deploy it, a
merchant account to route it through, and your numbers in the table.
