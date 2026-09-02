# Backend foundation

This document covers the database the site runs on: the Prisma schema, how to run
it locally, and the reasoning behind the shape it has.

**Status, corrected 2026-08-31: the site reads from Postgres, in production.**
The header of this file previously said *"the site does not use the database
yet"* and described `src/data/` as the only thing any page imports. Both were
false long before they were fixed. The catalogue is served from Supabase
Postgres to the live site at `malfleks-richarddaud543-stack.vercel.app` — verified by
fetching `/brands` anonymously and getting all six brands with their real branch
counts. `src/data/` survives only as the seed's input; see
[Remaining cutover work](#remaining-cutover-work) for exactly which imports are
left and why.

**Postgres is the only provider.** SQLite was the original one and is referred to
in the past tense throughout. There is no fallback: `resolveDatabaseUrl()` throws
when `DATABASE_URL` is unset, deliberately, because manufacturing a connection
string that cannot work made every downstream tool report the symptom instead of
the cause.

---

## Decision: Prisma owns the catalogue; Firebase is scoped to Auth and Analytics

**Decided 2026-08-15 by the owner. This closes debt #14 and is not an open question.**

**Amended 2026-08-28: the Firebase half of this decision no longer describes
anything.** Auth moved to Supabase, and Analytics and App Check were removed with
no replacement. The catalogue half stands unchanged and is the reason the move
was cheap — nothing that mattered was in Firestore. Every Firestore prohibition
below is now enforced by there being no Firestore: `src/lib/firebase.ts`,
`src/components/firebase/`, `src/server/firebase/`, `firestore.rules`,
`firebase.json` and both Firebase packages are deleted. Read what follows as the
reasoning that put the catalogue in Prisma, which is still load-bearing, not as
a description of a second store that exists.

The repo briefly held two persistence stacks — this one, and a Firebase SDK wired to
project `v-mall-f37c6` — with neither read by any page. That ambiguity was the expensive
kind: both looked equally live, so whoever came next would build against whichever they
found first.

**Prisma is the catalogue's source of truth.** Firebase is scoped to **Auth and
Analytics**, and nothing else. Analytics was live at the time (`src/lib/firebase.ts`,
`src/components/firebase/FirebaseAnalytics.tsx`, both since deleted). Auth was not
built yet.

The reasoning, from two engineers who reached it independently from opposite ends:

- **The schema is genuinely relational** — real foreign keys, a join table chosen for
  indexed queries, a tested denormalisation invariant. Firestore has no joins, so every
  one of those would become a manually synchronised field. That is debt #8 generalised
  across the whole catalogue rather than contained.
- **Firestore's real strengths — offline sync and realtime listeners — are not what an
  ops-managed, public-read catalogue needs.** Paying their modelling cost buys nothing
  here.
- **Payment cannot honestly attach to an order record the backend has never seen**, so
  server persistence is the blocker in front of commerce either way. Prisma is far closer
  to done: the repository layer already deep-equals every accessor against the static
  data, and the Postgres cutover is a documented four-file change.

**What this forbids**, so it does not creep back: no Firestore reads or writes, no
Firestore collections for catalogue data, no second source of truth for brands, branches,
products or agents.

**What remains open:** one narrowly-scoped exception may be revisited later — letting
Firestore own a genuinely realtime slice such as live order status, which is the one
thing it would do better than Postgres here. That would need its own decision recorded
below this one, not an assumption.

*(That exception was taken on 2026-08-16 and reversed on 2026-08-28 — both blocks
below. It cannot be reopened as written: there is no Firestore in the repo to grant
it to.)*

---

## Decision: Firestore owns saved order requests, and only those

**Decided 2026-08-16, assigned by the Lead, built by ENG-7 · Vault. This is the
narrowly-scoped exception the decision above left open, now taken.** Full
reasoning and the operator runbook: [`docs/auth.md`](auth.md).

**Reversed 2026-08-28 — the reversal is the last decision block in this run, after
the `Order` block it interleaves with.** This block is kept exactly as it was
written because the argument in it was correct when it was made; what changed is
the ground it stood on, and that is the part worth reading. Nothing below this
line describes the code today.

A signed-in customer's saved order requests live in Firestore at
`customers/{uid}/orderRequests/{autoId}`. Nothing else does.

Why this is the exception rather than a crack in the decision above:

- **It is user-scoped, not catalogue data.** It is keyed by Firebase uid, joined
  to nothing, and has no foreign keys. None of the arguments that made the
  catalogue relational apply to it.
- **The identity that owns it already lives in Firebase.** Putting these records
  in Postgres would mean mirroring Firebase uids into a second store — creating
  exactly the two-sources-of-truth problem debt #14 was closed to avoid, in the
  one place it is genuinely avoidable.
- **Ownership is enforceable by path.** `customers/{uid}/…` compared against
  `request.auth.uid` in Security Rules is a guarantee Postgres would need
  application code to reproduce.

**What this still forbids, unchanged:** no Firestore reads or writes for
brands, branches, products or delivery agents; no second source of truth for
catalogue data. The catalogue is Prisma's. `src/server/orders/saved-requests.ts`
*reads* the catalogue through the existing `src/data` accessors to rebuild an
order server-side — it never writes catalogue data to Firestore.

**Cascade note, now live.** The "Cascades" section below flags that the
seed's pruning and the cascade rules must be revisited "once orders reference
branches and products". A saved order request stores a *snapshot* of the
product, branch and brand rather than a foreign key, precisely so a catalogue
edit cannot orphan or silently rewrite a request a customer is holding a
reference to. So this decision does not yet force that change — but it is the
first thing in the system that remembers a catalogue row, and the next one may.

---

## Decision: Orders are persisted in Prisma, as a real `Order` table

**Built 2026-08-25 by ENG-4 · Forge, on the owner's decision to remove the
"signed-out customers transmit nothing" property in favour of every order
request getting a real, queryable backend record.** This is the "next one"
the note above was waiting for, and it resolves both flags it left open.

Every submission of `OrderRequestForm` — signed in or anonymous — now writes
an `Order` row via `src/server/orders/create-order.ts`, called from the
server action `submitOrder` in `src/app/actions/orders.ts`. `customerId` is
the user id from the verified session — a Firebase uid when this was built, a
Supabase user id since 2026-08-28 — or `null` for a signed-out customer; either
way the write happens, which is the entire point of this change.

**Why Prisma, not the Firestore exception above.** An order is not the
narrowly-scoped, user-only slice that decision carved out — it joins to
product, branch, brand and delivery agent, and the whole reason to persist it
at all is so an admin or a branch can query it later ("orders waiting on us",
"this branch's orders today"). That is the catalogue's own shape, the one
Firestore has no joins for. The saved-order-requests decision above is
unchanged and stays exactly what it was: a signed-in customer's own,
separately-deletable convenience copy. Both now exist side by side for a
signed-in customer's order — a durable business record in Prisma, and a copy
they can delete themselves in Firestore — and that duplication is deliberate,
not an oversight: deleting the customer's copy removes *their* copy, not the
order that exists whether or not they keep a copy of it. **Both copies are
Prisma rows since 2026-08-28**; the duplication and the reasoning for it are
unchanged, because the distinction was always lifecycle rather than store.

**No second copy of the trust boundary.** `buildOrderRequest` — the pure
function that re-derives price, carrier and route from the catalogue so a
client can never say what an order cost — moved from `saved-requests.ts` to
`src/server/orders/build-order-request.ts`, with no Firestore dependency, so
the Prisma path did not have to import `firebase-admin` to reuse it.
`saved-requests.ts` re-exports everything from there, so nothing that
imported the old location has to change.

**The `Order` model's references are loose on purpose.** `productId`,
`brandId`, `branchId` and `agentId` are all nullable with
`onDelete: SetNull`, never a required FK and never `Cascade`. Every field a
page would actually render is also snapshotted as plain text/int columns
(`productName`, `unitPriceTZS`, `branchCity`, `routeCarrier`, …), mirroring
`OrderRequest` in `src/lib/order.ts` field for field. This is exactly the
"an order pointing at a deleted branch is a worse outcome than a failed
delete" reasoning the Cascades section below used to flag as future work —
now built, and covered by a test (`create-order.test.ts`) that deletes a
branch and an agent an order points at and asserts the order survives with
those two columns nulled and every snapshot field untouched.

**`reference` is `@unique`, with a regenerate-and-retry-once on collision.**
The reference alphabet is 28 characters over 4 slots — 614,656 codes per
brand+city pair — which is small enough that the saved customer copy never had
to worry about it (a customer deletes those; nobody has 900 outstanding
requests to one branch) but an indefinitely-retained `Order` table does. The
retry does not duplicate `generateOrderReference`: it hands `buildOrderRequest`
a reference that fails sanitisation, the same path a tampered client
reference already takes, and lets it regenerate on its own.

Both flags this closes:

- **Cascades** (below): "once orders reference branches and products, revisit
  it" — done. `Branch`, `Product` and `AgentRegion` still cascade from their
  own catalogue parents unchanged; nothing cascades *into* `Order`.
- **Seeding**: "when orders arrive, replace the prune with a soft delete or
  drop it" — neither was needed. The prune still hard-deletes a branch or
  product removed from `src/data`, and that is fine now: `onDelete: SetNull`
  on every `Order` reference column means the prune nulls the link on any
  order that pointed at the deleted row rather than deleting the order. See
  the updated comment in `src/server/db/seed.ts`.

**The status workflow, added the same day.** `/admin/orders` shipped
deliberately read-only (`52fa846`) because no status vocabulary existed yet —
every order sat at `status = "pending"` forever, with no code anywhere that
wrote another value. **The owner defined the vocabulary, relayed by the Lead,
and it was built by ENG-4 · Forge on 2026-08-25**:

- `pending` (default, unchanged) — submitted, nothing done yet.
- `confirmed` — admin verified with the branch that the product is available
  at the quoted price and delivery is proceeding. Still no money moves — this
  is not a checkout, only a firmer request.
- `cancelled` — won't be fulfilled (out of stock, branch declined, customer
  unreachable/withdrew). Carries a reason, stored in the new
  `Order.decisionNote` column.
- `fulfilled` — delivered / handed off, request complete. Terminal.

Transitions: `pending -> confirmed | cancelled`, `confirmed -> fulfilled |
cancelled`. Nothing moves out of `fulfilled` or `cancelled`.

**MalFleks admin only moves it, from `/admin/orders`.** There is no
partner-facing order queue, and none was faked in this round —
`Partner`/`PartnerUser` records are not linked to "their" orders anywhere in
this schema; wiring that up is real future scope.

**Built to the same shape as the partner-application review flow**
(`src/server/partners/review.ts`), because that flow already found and fixed
the exact concurrency bug this one would otherwise reintroduce: two admin
tabs racing a decision on the same row. `src/server/orders/status.ts` holds
`canTransition` (pure, exhaustively tested) and the guarded write — an
`updateMany` with the valid source statuses in the WHERE, never `update` by
id — and `Order.decidedBy`/`decidedAt`/`decisionNote` mirror
`PartnerApplication.reviewedBy`/`reviewedAt`/`decisionNote` field for field.
A real-database integration test (`status.integration.test.ts`) proves the
guard: two concurrent `Promise.all` calls at the same target — the "two tabs
both click Confirm" scenario — resolve to exactly one success, never both.
Migration: `20260825164357_add_order_status_workflow`, three new nullable
columns, no data migration needed.

---

## Decision reversed: saved order requests are a Prisma table, like everything else

**Migrated 2026-08-28, when Firebase left the repo entirely.** This reverses the
second decision above. That block is kept intact rather than edited, because the
argument in it was right when it was made and the interesting part is which leg
of it broke.

Saved order requests are rows in `SavedOrderRequest`
(migration `20260828000000_saved_order_requests`), read and written by
`src/server/orders/saved-requests.ts` through the same client as everything else.
`customers/{uid}/orderRequests` does not exist, and neither does the database it
lived in.

**The original argument, leg by leg.** It had three, and the first and third
rested on the second:

- *It is user-scoped, not catalogue data — none of the arguments that made the
  catalogue relational apply to it.* Still true. But that was only ever an
  argument that Firestore did no **harm** here, never that Postgres was the wrong
  place for it.
- *The identity that owns it already lives in Firebase, so Postgres would mean
  mirroring Firebase uids into a second store.* **This is the leg that broke, and
  it took the decision with it.** The identity now lives in Supabase, which is
  Postgres — the same database the catalogue is in. There is no second store to
  mirror a uid into. Keeping a Firestore collection would have *created* the
  two-sources-of-truth problem debt #14 was closed to avoid, which is the exact
  inversion of the reason it was allowed in the first place.
- *Ownership is enforceable by path — `customers/{uid}/…` compared against
  `request.auth.uid` in Security Rules is a guarantee Postgres would need
  application code to reproduce.* True, and the trade was worth making the other
  way once the second leg went. Ownership is a `where: { customerId }` clause on
  a `customerId` taken from the verified session and never from a payload. The
  guarantee `firestore.rules` used to carry is now carried by
  `src/server/orders/saved-requests.integration.test.ts`, which proves it against
  a real Postgres rather than against an emulator: a customer reads only their own
  rows, and a delete aimed at another customer's id neither succeeds nor reveals
  that the row exists.

**Three things the move made smaller**, recorded because they are the concrete
gain rather than the tidy-up:

- **The id-injection surface is gone rather than guarded.** Firestore's
  `collection.doc(id)` takes a *path* — `doc("a/b/c")` addresses a nested
  document — so a browser-supplied id could step outside the customer's own
  subcollection, which is why the old code carried an `isValidRequestId` regex to
  stop it. A foreign id now matches zero rows.
- **Delete is one guarded statement.** Firestore's `delete()` succeeds on a
  document that was never there, so the old path read first and then deleted: two
  round trips with a race between them. `deleteMany` reports how many rows it
  matched, which answers "did it exist" and "is it gone" at once — the same
  discipline the status workflow above uses for its guarded `updateMany`.
- **No server-timestamp limbo.** `savedAt` was a Firestore sentinel that read back
  as `null` for the instant between the write being acknowledged and the timestamp
  materialising, and every reader had to handle that. Postgres writes the value in
  the same statement.

**What is unchanged.** This is still an *addition* on top of every order request
also being persisted as an `Order`, not a replacement for it, and the distinction
is still lifecycle: an `Order` is MalFleks's operational record and must survive, while
this is the customer's own copy whose entire point is that they can delete it. The
per-customer ceiling of 200 is unchanged, and so is the hard-delete decision
recorded against debt #20 — a shell row settles no dispute when MalFleks has told the
branch nothing.

**What this forbids is now structural rather than written down.** There is one
store. The prohibition the first decision had to spell out — no second source of
truth for catalogue data, no Firestore collections — is enforced by there being
nowhere else to put anything.

---

## Quick start

From a fresh clone:

```bash
npm install          # also runs `prisma generate` via postinstall
npm run db:setup     # apply migrations, then seed from src/data
npm test             # 582 tests over 46 files, incl. suites against a real DB
```

`npm run db:setup` is `prisma migrate deploy && prisma db seed`.

**A `.env` with `DATABASE_URL` is required** — copy `.env.example` and point it
at a Postgres server. There is no fallback of any kind. This used to say that an
unset variable fell back to a SQLite file at `prisma/dev.db`; that fallback was
deleted with the provider, and `resolveDatabaseUrl()` now throws a message naming
the variable, where it goes, and what it should look like.

The integration suites need a Postgres server too, via `TEST_DATABASE_URL` —
they isolate themselves per suite with a dedicated schema rather than a temp
file. Note that **Vitest does not read `.env`**; `vitest.config.mts` loads it
explicitly, because Next reads it for dev/build and `prisma.config.ts` reads it
for the CLI, and neither of those covers the test runner.

| Script | What it does |
| --- | --- |
| `npm run db:generate` | Regenerate Prisma Client (also runs on `npm install`) |
| `npm run db:migrate` | `prisma migrate dev` — create + apply a migration after a schema edit |
| `npm run db:deploy` | `prisma migrate deploy` — apply existing migrations, no schema diffing |
| `npm run db:seed` | Run `prisma/seed.ts` |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:setup` | `db:deploy` + `db:seed` |
| `npm run db:studio` | Prisma Studio |

Prisma Client generates into `node_modules/@prisma/client`, which is already
ignored. (`*.db` and `*.db-*` remain in `.gitignore` as leftovers from the SQLite
era; harmless, and cheaper to leave than to explain.)

---

## Layout

```
prisma/
  schema.prisma          the models
  migrations/            committed SQL; the source of truth for the DB shape
  seed.ts                thin CLI wrapper
prisma.config.ts         Prisma 7 config (schema path, seed command, CLI datasource URL)
src/server/
  db/database-url.ts     one place that decides the connection string
  db/client.ts           lazily-built, globally-cached PrismaClient
  db/mappers.ts          row -> domain type
  db/seed.ts             the seed logic (importable, so tests can call it)
  repositories/index.ts  the accessor API, mirroring src/data/index.ts
  repositories/repositories.test.ts
```

---

## Schema rationale

The models mirror the interfaces in `src/data/types.ts` field for field. Where
they differ, it is for a reason recorded below and in the schema comments.

### `verified` is a first-class column

Both `Branch` and `DeliveryAgent` carry `verified: Boolean` — not nullable, not
derived. It is the project's line between researched-real facts and illustrative
placeholders, the UI renders trust badges off it, and it must never be inferred
from "does this record look complete". The seed round-trips it per record and a
test asserts it per branch.

### `priceTZS` is an `Int`

Tanzanian shillings are transacted as whole numbers, so the column is `INTEGER`
and never `REAL`/`Float`. Float money accumulates rounding error the moment
anything is summed. The seed rejects any non-integer or negative price before
inserting, and a test asserts `Number.isInteger` on every product after a
round-trip.

One real limit: Postgres `INTEGER` is 32-bit, capping a price at ~2.15 billion
TZS (roughly USD 800k). The current catalogue tops out at 245,000,000 TZS
(BMW X5), so there is ample headroom, but if MalFleks ever lists property, plant or
fleet orders, widen `priceTZS` to `BigInt` **before** that data arrives —
narrowing later is a data migration, widening now is one line. This limit is
real now: it was theoretical while the provider was SQLite, whose INTEGER is
64-bit.

### `specs` became a table, not a JSON column

`Product.specs` is `Record<string, string>` in TypeScript. Prisma had no
portable map type at the time: `Json` was unsupported on SQLite, and `String[]`
scalar lists are Postgres/CockroachDB-only. Rather than pick a type that would
have to change when the provider changed, specs are stored as rows in
`ProductSpec` (`@@id([productId, key])`).

That constraint is gone now that Postgres is the only provider — `Json` is
available, and `SavedOrderRequest.payload` uses it. The join table stays anyway,
for the three reasons below, which never depended on the provider.

This costs a join and buys three things: the schema is provider-neutral, specs
become queryable (`where: { specs: { some: { key: "Drive", value: "4x4" } } }`
is a real filter for the faceted search), and a duplicate spec key is impossible
by construction. A `position` column preserves declaration order, because spec
order is visible on the product page — Engine before Seats, not alphabetical.

### `regionsServed` became a table, for the same reason

`DeliveryAgent.regionsServed` is a `string[]`. Same constraint, same solution:
an `AgentRegion` join table with `@@id([agentId, region])` and an index on
`region`. This one earns its keep immediately — `getAgentsForCity` matches on
*either* the agent's home city *or* membership in `regionsServed`, and with a
join table that second half is an indexed lookup instead of a scan over
serialised strings.

### `sortOrder` on every top-level model

The static accessors return records in source-declaration order, which is
neither id- nor name-sorted (`toyota-dar`, `toyota-arusha`, `toyota-mwanza`).
Rows in a table have no inherent order. Without persisting the array index, the
DB-backed functions would return the same *set* in a different *order* and the
site's layout would silently shift on cutover. The seed writes the index; every
list query orders by it. It also gives editors an explicit ordering lever later.

`sortOrder` is not part of the domain types, and the mappers drop it — the
repository return shapes stay byte-identical to the static ones.

### Text columns instead of enums

`Brand.category` (`"automotive" | "electronics" | "telecom"`) and
`Branch.country` (`"Tanzania"`) are TypeScript literal unions. They are `TEXT`
because SQLite had no enum type. The union is re-established in
`src/server/db/mappers.ts`, which throws on an unexpected value rather than
silently widening the type for every downstream consumer.

On Postgres these could become real enums. They have not been, and the runtime
narrowing in `mappers.ts` would still be worth keeping if they were — a value
that reaches the mapper from outside a migration is exactly the case an enum
does not catch.

### `Product.brandId` stays denormalised

The static data carries `brandId` on products even though it is reachable via
the branch, and the schema keeps it: every product card, search facet and
`generateStaticParams` filters by brand without needing the branch. The seed
asserts the two agree (`assertStaticDataIsConsistent`), so the denormalisation
cannot drift unnoticed.

### Cascades

`Branch`, `Product`, `ProductSpec` and `AgentRegion` all cascade from their
parent. Deleting a brand cannot leave orphaned products.

**Revisited, as flagged: `Order`'s references are the opposite.** Now that
orders reference branches and products (see the third Decision block above),
`Order.productId`/`brandId`/`branchId`/`agentId` are all `onDelete: SetNull`,
not `Cascade` and not required. The catalogue's own cascades are right
precisely because a brand is expected to own its branches; an order is not
owned by the branch that fulfilled it in the same sense — it is evidence of
what a customer was shown, and deleting the branch later must not delete that
evidence. An order pointing at a deleted branch is a worse outcome than a
failed delete, so the schema makes it the only possible outcome.

---

## Seeding

`prisma/seed.ts` is a wrapper; the logic is `seedDatabase()` in
`src/server/db/seed.ts` so the test suite can call it directly against a
throwaway database instead of shelling out to the CLI.

It is **convergent, not additive**:

- every record is `upsert`ed by its stable hand-written id, so a second run
  updates in place rather than duplicating;
- child rows (specs, regions) are replaced wholesale per parent, so a renamed
  spec key does not leave the old key behind;
- records that no longer exist in `src/data` are **deleted**, so the database is
  an exact mirror rather than an ever-growing superset;
- the whole thing runs in one transaction (60s budget), so a failure leaves the
  previous state rather than a half-seeded database.

**Revisited, as flagged: orders now write to these tables, and the prune is
unchanged.** It still hard-deletes a branch or product removed from
`src/data`. That is fine, not a gap that was missed — see the Cascades
section above: every `Order` reference column is `onDelete: SetNull`, so a
pruned branch or product nulls the matching column on any order that pointed
at it and leaves the order, its snapshot fields and its history alone. The
soft-delete alternative this note used to propose turned out not to be
necessary; the schema already makes the destructive read of "prune" — delete
the order too — unreachable.

Before touching the database the seed validates invariants the TypeScript types
cannot express: unique ids and slugs, every `branch.brandId` and
`product.branchId` resolving, `product.brandId` agreeing with its branch's
brand, and integer non-negative prices. The seed is the last cheap place to
catch a typo in hand-written data.

Current content: **6 brands, 19 branches, 38 products (89 specs), 5 delivery
agents (8 region rows)**.

---

## The repository layer

`src/server/repositories/index.ts` exposes the same names, argument order and
return shapes as `src/data/index.ts`:

| Function | Static | Repository |
| --- | --- | --- |
| `getAllBrands()` | `Brand[]` | `Promise<Brand[]>` |
| `getBrandBySlug(slug)` | `Brand \| undefined` | `Promise<Brand \| undefined>` |
| `getBrandById(id)` | `Brand \| undefined` | `Promise<Brand \| undefined>` |
| `getBranchesByBrandId(brandId)` | `Branch[]` | `Promise<Branch[]>` |
| `getBranchById(id)` | `Branch \| undefined` | `Promise<Branch \| undefined>` |
| `getProductsByBranchId(branchId)` | `Product[]` | `Promise<Product[]>` |
| `getProductById(id)` | `Product \| undefined` | `Promise<Product \| undefined>` |
| `getAgentsForCity(city)` | `DeliveryAgent[]` | `Promise<DeliveryAgent[]>` |

The only difference is the `Promise`. That symmetry is the point: cutting a
server component over is a change of import path plus an `await`.

The static module also exports the raw arrays (`brands`, `branches`, `products`,
`deliveryAgents`), which a handful of call sites use. The repository offers
`getAllBrands`, `getAllBranches`, `getAllProducts` and `getAllDeliveryAgents`
instead of re-exporting constants, so those call sites have to acknowledge that
they are doing a full table read.

Two behaviours worth calling out because they are easy to break:

- **`getAgentsForCity` matches on both `city` and `regionsServed`.** A
  nationwide courier headquartered in Dar es Salaam must still surface for a
  Dodoma order. Implemented as `OR: [{ city }, { regionsServed: { some: { region: city } } }]`.
- **Matching is exact and case-sensitive**, exactly like the static `===` and
  `Array.includes`. `getAgentsForCity("dodoma")` returns `[]` in both
  implementations. A test asserts this, so if we ever want case-insensitive
  matching it will be a deliberate change to both, not an accident in one.

`src/server/db/client.ts` builds the client lazily and caches it on `globalThis`
so Next dev's module reloading does not leak connections. Lazy construction is
also what lets the tests bind a fresh database without mocking anything.

These modules are server-only by convention, not enforcement — importing
`server-only` would break them under Vitest. Keep them out of `"use client"`
files.

---

## Tests

`src/server/repositories/repositories.test.ts` (21 tests) runs against a real
Postgres database. Nothing is mocked. Per run it:

1. points the client at a **dedicated schema** and resets the cached client;
2. applies the **committed migrations** with `prisma migrate deploy` — not
   `db push` from the schema, so a migration that has drifted from the schema
   fails the test suite rather than production;
3. calls the real `seedDatabase()`;
4. asserts, for **every** brand / branch / product / city in the dataset, that
   the repository function deep-equals its static counterpart.

Plus targeted assertions that a shallow diff would miss: `priceTZS` integrality,
spec key order, `verified`/`deliveryOffered` per branch, absent phone numbers
mapping to `undefined` rather than `null`, the region-vs-city agent match, and
seed idempotency (row counts and full result sets unchanged after a second run).

The file opens with `// @vitest-environment node` because the project's Vitest
default is `jsdom`, which Prisma cannot run in.

### The schema isolation is load-bearing, and it is not what it looks like

Per-suite isolation used to be a temp SQLite file. On Postgres it is a schema,
and getting that right took a measurement rather than a guess:
**`?schema=` in the connection string is ignored by a Prisma driver adapter.**
Prisma's own connection layer reads that parameter; the adapter hands the string
straight to `pg`, which has no such thing. Seven suites that believed they were
isolated were all reading and writing `public` — proved by pointing a client at
an empty schema and watching it return `public`'s six brands.

The fix in `src/server/db/client.ts` sets **both** the Prisma `{ schema }` option
and the session `search_path`:

```ts
new PrismaPg(
  { connectionString: url, options: `-c search_path=${schema},public` },
  { schema },
)
```

Either one alone leaves a hole. If you touch that function, re-run the suites and
check they still fail when pointed at an empty schema — a passing suite is not
evidence of isolation here.

---

## The move to Postgres — done 2026-08-27/28

**This section used to be a six-step plan.** It is now a record, for the same
reason the cutover section below was rewritten: a document that describes
finished work as pending sends someone hunting for a job that is already done.

The schema was written to make this a provider change rather than a rewrite, and
that held — no model, relation, index, repository function or mapper changed.
What actually happened:

1. `@prisma/adapter-pg` installed; `datasource db` in `prisma/schema.prisma` is
   `provider = "postgresql"` with no `url` (Prisma 7 moved it to
   `prisma.config.ts`).
2. `src/server/db/client.ts` builds a `PrismaPg` adapter. It still imports
   `PrismaBetterSqlite3` and `assertProviderMatches` rejects a SQLite URL with a
   clear error, because **the generated client is bound to its schema's
   provider** — handing a Postgres string to a SQLite client is a confusing
   crash at first query rather than an error at startup.
3. The SQLite migrations were deleted and replaced by
   `20260827000000_init_postgres`, generated against an empty database. Safe
   precisely because nothing but seeded catalogue data existed.
4. The SQLite fallback in `src/server/db/database-url.ts` was deleted.
   `resolveDatabaseUrl()` throws when `DATABASE_URL` is unset, and the message
   names the variable, the file it belongs in, and the shape it should take —
   including the Windows trap where Notepad silently saves `.env.txt`.

### Three things that bit, worth not repeating

- **The direct Supabase host is IPv6-only on the free tier**, and most home and
  mobile ISPs — Tanzanian ones included — are IPv4-only. Use the **session
  pooler** (port 5432) for migrations and the **transaction pooler** (port 6543)
  for the deployed app. Nothing about this is in the error message you get.
- **`prisma generate` must not require a URL.** `postinstall` runs it on every
  `npm install`, including on a fresh clone and on the migration runner whose
  whole job is to supply the URL to a later step. `prisma.config.ts` therefore
  sets `datasource.url` only when `DATABASE_URL` is non-empty.
- **Production's tables were created outside Prisma**, through the Supabase API,
  so no `_prisma_migrations` table existed and `migrate deploy` refused with
  P3005. It was baselined with `migrate resolve --applied` after comparing all 13
  tables column-for-column against the init migration.

### Optional follow-ups, each deliberate rather than owed

- turn `Brand.category` into a real `enum` — but keep the runtime narrowing;
- widen `priceTZS` to `BigInt` if the catalogue will ever exceed ~2.15bn TZS
  (see above) — this changes the TS type to `bigint`, so do it with intent;
- add a trigram or full-text index for search instead of the in-memory scoring in
  `src/lib/search.ts`;
- `AgentRegion` could collapse into a `String[]` column now that the provider
  supports it, but there is no reason to — the join table indexes better.

---

## Remaining cutover work

**Corrected 2026-08-27.** This section previously opened *"The application still
reads `src/data` exclusively. Nothing below has been done"*, and then listed nine
files to migrate and two "genuinely hard spots". All of it described a repository
that stopped existing on **2026-08-17**, when the pages were moved onto the
database. One of the two hard spots — `src/components/three/HeroScene.tsx` — was
deleted outright in the light-direction pass and the directory it lived in no
longer exists.

It is rewritten rather than patched because a document that lies about the
codebase costs more than a missing one: someone goes hunting for work that is
already done, and finds a file that is not there. That is the same reasoning the
debt register applied on 2026-08-22, when two rows were found stale and corrected
in place.

### What is actually true today

**Every page reads the database**, through `src/server/repositories`. The home
page, `/brands`, `/brands/[slug]`, the branch page, `/products/[id]`,
`/delivery/[productId]`, `/agents`, `/search`, `/locator`, `/admin`, `/apply` and
`sitemap.ts` all import from the repository layer, not from `src/data`.

**`src/data` is still the editorial source**, and `seedDatabase` still mirrors it
into the database. That is debt #8, and it is deliberate rather than forgotten:
the arrays are where a human edits the catalogue today. `parity.test.ts` is the
interim guard — ten cases, same records, same order — and the direction reverses
when `ProductSubmission` and the admin publish flow become how products arrive.
(Both landed 2026-08-27; the reversal completes when the seed's prune is retired,
which needs real submitted products to reverse *into*.)

Most remaining mentions of `@/data` outside `src/data` itself are `import type` —
the domain types, which the repository imports and re-exports so the two
implementations are provably the same shape. Those are not a cutover concern at
all.

### The value imports that remain, and why

Six files import *values* rather than types. Each is either correct or a known,
tracked exception:

| File | Imports | Status |
| --- | --- | --- |
| `src/server/db/seed.ts` | `brands`, `branches`, `products`, `deliveryAgents` | **Correct.** This is the seed. It is what mirroring means. |
| `src/lib/search.ts` | `brands`, `branches`, `products` | **Debt #6, resolved in the shape that matters.** `buildListings` is the pure half and `/search` builds the joined set on the server; the module-scope arrays survive only as `getListings()`'s default argument, for tests. |
| `src/lib/order.ts` | `getAgentsForCity` | Open. `resolveDeliveryRoute` reaches for couriers synchronously, and it is called from client components. Needs the agent list passed in, the same prop-drill `Hero`/`BrandMarquee`/`ShowcaseCarousel` already had. |
| `src/server/orders/build-order-request.ts` | `getBranchById`, `getBrandById`, `getProductById` | Open, and the sharpest of the six. This is the trust boundary that re-derives price from the catalogue — it should re-derive from the *database*, which is what a customer was actually shown. |
| `src/server/partners/applications.ts` | `brands` | Open, small. Validates a claimed `brandId` against the brand list. |
| `src/components/locator/locator.fixture.ts` | `branches`, `brands`, `deliveryAgents` | **Correct.** A test fixture. |

Two of those — `build-order-request.ts` and `order.ts` — are the ones worth
sequencing deliberately, because both sit on the order path and both are
synchronous today. Neither is urgent while `src/data` and the database are still
mirrored and `parity.test.ts` proves they agree.

### Still worth deciding before the source of truth flips

- **Caching.** Pages hit the database now, and `generateStaticParams` still
  prerenders paths from it. Decide per route between ISR and dynamic rendering
  before the catalogue is large enough for the build cost to matter.
- **Type ownership.** The repository imports the domain types from
  `@/data/types` and re-exports them. When `src/data` is retired, `types.ts`
  should move (to `src/server/` or a shared `src/types/`) and that import
  updated — one line.
- **The seed's prune.** It hard-deletes a branch or product removed from
  `src/data`. That is safe for orders (`onDelete: SetNull` keeps the order and
  nulls the link) but it is not safe for a *published submission*, which has no
  representation in `src/data` at all and would be pruned on the next seed. This
  is the concrete thing that has to change when the direction reverses, and it is
  the last piece of debt #8.
