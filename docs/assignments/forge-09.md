# FORGE-09 · Make the platform deployable, and finish the partner spine

**Assigned to** ENG-4 · Forge — Platform & Backend
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 1
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

Soko has a real `Order` table, an admin queue and a partner application pipeline, and
none of it can be deployed anywhere. The provider is SQLite, there is no remote, and an
approved `Partner` is a row that points at nothing. This assignment closes the backend
half of that gap so that the day a deploy target exists, the schema is ready for it.

Four things, in this order. Each is independently shippable; if the session runs out,
stop at a clean boundary and report exactly where.

---

## Phase 0 — Onboarding (do this first, record it)

Research on the live web, primary sources preferred, and write what you find into
`docs/research/software-engineering.md` with links:

1. **Prisma 7 on Postgres via a driver adapter.** You already use
   `@prisma/adapter-better-sqlite3`. What is the current Postgres equivalent, and what
   changes in `prisma.config.ts` versus `src/server/db/client.ts`?
2. **Connection pooling for a serverless or edge Next.js deploy.** A Postgres connection
   per lambda invocation is the classic way to exhaust a database. What is the current
   recommended shape — a pooler, a proxy, a driver that speaks HTTP?
3. **Running the same migration set against two providers.** Prisma migrations are
   provider-specific in their emitted SQL. Find out what actually breaks and what the
   supported answer is, because the schema comments claim Postgres-compatibility and
   nobody has ever tested that claim.

Research that contradicts this brief is the most valuable kind. If (3) turns out to mean
"you cannot keep one migration folder for both", say so and stop — do not invent a
workaround and quietly ship it.

---

## Phase 1 — Build

### 1. Prove the Postgres claim, without giving up SQLite

`prisma/schema.prisma` says in its header comment that everything was chosen to be
Postgres-compatible: no scalar lists, no enums, no `Json`. That has never been executed.

- Stand up a real Postgres locally (Docker is fine) and run the **full committed
  migration set** against it, from empty.
- Run `repositories.test.ts` and `parity.test.ts` against it. They build a throwaway
  database from the committed migrations and run the real seed — that property is the
  whole reason those tests are worth having, so keep it and give it a second provider.
- Dev stays SQLite. Nothing about `npm run dev` with no `DATABASE_URL` may change; that
  zero-setup path is deliberate.
- The three known swap points are `datasource db` in the schema, the connection string in
  `prisma.config.ts`, and the adapter in `src/server/db/client.ts`. If it turns out to be
  more than three, correct `docs/backend.md`'s "Switching to Postgres" section — a wrong
  count in a document costs more than an open question.

**Report the diff between the two providers honestly.** If something in the schema is not
in fact portable, that is a finding, not a failure.

### 2. `OrderEvent` — the append-only history

`Order` carries `decidedBy`/`decidedAt`/`decisionNote`, which records only the *last*
transition. `docs/marketplace-model.md` Stage 1 asks for an append-only status history,
and a money system will need it before it needs anything else.

- New model `OrderEvent`: `id`, `orderId` (→ `Order`, cascade — an event has no meaning
  without its order), `fromStatus`, `toStatus`, `actorUid`, `note`, `createdAt`.
- Written from inside the guarded transition in `src/server/orders/status.ts`, in the
  same transaction as the `updateMany`. If the guarded write loses the race and updates
  zero rows, **no event is written** — that is the property to test.
- Do not backfill. Existing orders have no history and pretending otherwise would be
  fabricating a record.

### 3. Link an approved partner to the catalogue

`Partner.branchId` and `Partner.agentId` are null and nothing ever sets them. The schema
comment explains why approval must not auto-create a live `Branch` — a stranger filling
in a form must never put an unverified address on the locator map.

Build the deliberate second step:

- A server function in `src/server/partners/` that links an approved `Partner` to an
  **existing** `Branch`/`DeliveryAgent` by id, or creates a new one with
  `verified: false` — never `true`, under any argument. Assert it.
- Guarded the same way `review.ts` is: an `updateMany` with the valid source state in the
  WHERE, never `update` by id. That flow already found and fixed the two-admin-tabs race;
  do not reintroduce it.
- Reject linking a `kind: "courier"` partner to a `Branch` and vice versa, at the
  function boundary, with a test.

### 4. `ProductSubmission`, and the publish flow

This is the reversal that closes debt #8.

- Model `ProductSubmission`: the submitting `partnerId`, the proposed product fields
  mirroring `Product`, `status` (`"pending" | "published" | "rejected"`, text not enum),
  and the same `reviewedBy`/`reviewedAt`/`decisionNote` triple every other review table
  in this schema uses.
- `publishSubmission()` writes the live `Product` row and flips the submission, in one
  transaction, guarded. A submission may be published exactly once — make the database
  say so, not a code comment.
- A submission's `branchId` is **derived from the partner**, never taken from the
  payload. Same trust boundary as `buildOrderRequest`: the browser says what it wants,
  not who it is.
- Server side only in this assignment. Atlas builds both UIs (ATLAS-11).

### 5. Partner-scoped order queries

`src/server/orders/list-orders.ts` serves the admin view. Add a partner-scoped query:
given a `partnerId`, return the orders for that partner's `branchId` (a branch) or
`agentId` (a courier). Scoped in the query, not filtered after the fact — a partner's
query must never load another partner's rows into memory in the first place.

No route in this assignment. Atlas builds it.

### 6. Correct the stale section in `docs/backend.md`

"Remaining cutover work" opens with *"The application still reads `src/data`
exclusively. Nothing below has been done."* That stopped being true on 2026-08-17. The
table of files, the two "genuinely hard spots" and the `HeroScene.tsx` entry are all
describing a repo that no longer exists — `HeroScene.tsx` was deleted outright.

Rewrite the section to say what is actually left, or delete it and say why in the commit.
A document that lies about the codebase is worse than a missing one, because someone will
go looking for work that is already done. This is the same discipline the debt register
applied on 22 Aug when two rows were found wrong and corrected in place.

---

## Files you own this round

`prisma/**` · `src/server/db/**` · `src/server/orders/**` · `src/server/partners/**` ·
`docs/backend.md` · `docs/research/software-engineering.md`

## Files teammates hold — do not edit

- `src/app/partner/**`, `src/components/partner/**`, `src/app/admin/**` — **Atlas** (ATLAS-11)
- `src/lib/fees/**` — **Ledger** (LEDGER-03)
- `src/server/auth/**` — **Vault** (VAULT-05). You may *read* the DAL; if you need a
  change there, say so in your report and let the Lead sequence it.
- `src/data/**` — **Mercury** (MERCURY-06), landing after you. Expect row counts to
  change; do not write the seed against today's counts as if they were fixed.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, and `CI=true npx playwright test`
against a production build. All clean. Plus the repository suite green against **both**
providers, which is the point of item 1.

## Before you finish

Update `.claude/skills/forge-platform/SKILL.md` with the migration and provider gotchas —
especially anything that sounded true and was not. Report what you changed, what you
deliberately did not, and your verification output.

## Not in scope

Do not create a git remote, do not deploy, do not touch payment. Do not run any git
command that changes state — the Lead is the only writer to `master`.
