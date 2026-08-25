# Backend foundation

Soko's catalogue currently lives in hand-written TypeScript arrays under `src/data/`.
This document covers the database that will eventually replace them: the Prisma
schema, how to run it locally, how to move it to Postgres, and what is left to do
before the site actually reads from it.

**Status: the site does not use the database yet.** `src/data/` is still the only
thing any page imports. Everything described here runs alongside it. That is
deliberate — see [Remaining cutover work](#remaining-cutover-work).

---

## Decision: Prisma owns the catalogue; Firebase is scoped to Auth and Analytics

**Decided 2026-08-15 by the owner. This closes debt #14 and is not an open question.**

The repo briefly held two persistence stacks — this one, and a Firebase SDK wired to
project `v-mall-f37c6` — with neither read by any page. That ambiguity was the expensive
kind: both looked equally live, so whoever came next would build against whichever they
found first.

**Prisma is the catalogue's source of truth.** Firebase is scoped to **Auth and
Analytics**, and nothing else. Analytics is already live (`src/lib/firebase.ts`,
`src/components/firebase/FirebaseAnalytics.tsx`). Auth is not built yet.

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

---

## Decision: Firestore owns saved order requests, and only those

**Decided 2026-08-16, assigned by the Lead, built by ENG-7 · Vault. This is the
narrowly-scoped exception the decision above left open, now taken.** Full
reasoning and the operator runbook: [`docs/auth.md`](auth.md).

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
the Firebase uid from the verified session, or `null` for a signed-out
customer; either way the write happens, which is the entire point of this
change.

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
not an oversight: deleting the Firestore copy removes *their* copy, not the
order that exists whether or not they keep a copy of it.

**No second copy of the trust boundary.** `buildOrderRequest` — the pure
function that re-derives price, carrier and route from the catalogue so a
client can never say what an order cost — moved from `saved-requests.ts` to
`src/server/orders/build-order-request.ts`, with no Firestore dependency, so
the Prisma path does not have to import `firebase-admin` to reuse it.
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
brand+city pair — which is small enough that a saved Firestore copy never had
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

---

## Quick start

From a fresh clone:

```bash
npm install          # also runs `prisma generate` via postinstall
npm run db:setup     # apply migrations, then seed from src/data
npm test             # 78 tests, incl. the repository suite against a real DB
```

`npm run db:setup` is `prisma migrate deploy && prisma db seed`. No `.env` is
required: with `DATABASE_URL` unset the app falls back to a SQLite file at
`prisma/dev.db` (see `src/server/db/database-url.ts`). Copy `.env.example` to
`.env` only if you want to point somewhere else.

| Script | What it does |
| --- | --- |
| `npm run db:generate` | Regenerate Prisma Client (also runs on `npm install`) |
| `npm run db:migrate` | `prisma migrate dev` — create + apply a migration after a schema edit |
| `npm run db:deploy` | `prisma migrate deploy` — apply existing migrations, no schema diffing |
| `npm run db:seed` | Run `prisma/seed.ts` |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:setup` | `db:deploy` + `db:seed` |
| `npm run db:studio` | Prisma Studio |

The SQLite file and its WAL sidecars are gitignored (`*.db`, `*.db-*`). Prisma
Client generates into `node_modules/@prisma/client`, which is already ignored.

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
(BMW X5), so there is ample headroom, but if Soko ever lists property, plant or
fleet orders, widen `priceTZS` to `BigInt` **before** that data arrives —
narrowing later is a data migration, widening now is one line. SQLite's INTEGER
is already 64-bit, so this only bites on Postgres.

### `specs` became a table, not a JSON column

`Product.specs` is `Record<string, string>` in TypeScript. Prisma has no
portable map type: `Json` is not supported on SQLite, and `String[]` scalar
lists are Postgres/CockroachDB-only. Rather than pick a type that would have to
change when the provider changes, specs are stored as rows in `ProductSpec`
(`@@id([productId, key])`).

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
`Branch.country` (`"Tanzania"`) are TypeScript literal unions. SQLite has no
enum type, so both are `TEXT`. The union is re-established in
`src/server/db/mappers.ts`, which throws on an unexpected value rather than
silently widening the type for every downstream consumer. On Postgres these can
become real enums (see below).

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
so Next dev's module reloading does not leak SQLite handles. Lazy construction is
also what lets the tests bind a fresh database without mocking anything.

These modules are server-only by convention, not enforcement — importing
`server-only` would break them under Vitest. Keep them out of `"use client"`
files.

---

## Tests

`src/server/repositories/repositories.test.ts` (21 tests) runs against a real
SQLite database in a temp directory. Nothing is mocked. Per run it:

1. points `DATABASE_URL` at a fresh temp file and resets the cached client;
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

---

## Switching to Postgres

The schema was written to make this a provider change, not a rewrite. Nothing in
it uses a SQLite-only or Postgres-only feature.

1. **Install the adapter**: `npm i @prisma/adapter-pg pg` (and `npm i -D @types/pg`).
2. **`prisma/schema.prisma`** — one line:
   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```
   (In Prisma 7 the `url` no longer lives here; see below.)
3. **`src/server/db/client.ts`** — one line: swap
   `new PrismaBetterSqlite3({ url })` for `new PrismaPg({ connectionString: url })`.
4. **`DATABASE_URL`** — set it to a Postgres URL. `prisma.config.ts` already
   passes it to the CLI and `resolveDatabaseUrl()` already prefers the env var;
   only the SQLite *fallback* in `src/server/db/database-url.ts` becomes
   meaningless and should be deleted so a missing URL fails loudly.
5. **Regenerate migrations.** SQLite migration SQL is not valid Postgres. Delete
   `prisma/migrations/` and run `prisma migrate dev --name init` against an empty
   Postgres database. This is safe precisely because the database holds nothing
   but seeded catalogue data — do it before any real data exists.
6. **Re-run the seed**: `npm run db:seed`.

No model, relation, index or repository function changes. The mappers do not
change either.

Optional once on Postgres, each a small deliberate follow-up rather than a
requirement:

- turn `Brand.category` into a real `enum` and drop the runtime narrowing in
  `mappers.ts`;
- widen `priceTZS` to `BigInt` if the catalogue will ever exceed ~2.15bn TZS
  (see above) — note this changes the TS type to `bigint`, so do it with intent;
- add a trigram/full-text index for search instead of the in-memory scoring in
  `src/lib/search.ts`;
- `AgentRegion` could collapse into a `String[]` column, but there is no reason
  to — the join table indexes better.

---

## Remaining cutover work

The application still reads `src/data` exclusively. Nothing below has been done,
and none of it should be until the branch-locator and order-request features
have landed.

### Files that import `src/data` at runtime

These need their import path changed and their data access awaited:

| File | Imports | Notes |
| --- | --- | --- |
| `src/app/page.tsx` | `getAllBrands` | Server component — trivial |
| `src/app/brands/page.tsx` | `getAllBrands` | Server component — trivial |
| `src/app/brands/[slug]/page.tsx` | `brands`, `getBrandBySlug`, `getBranchesByBrandId` | `brands` is used by `generateStaticParams` |
| `src/app/brands/[slug]/branches/[branchId]/page.tsx` | branch + product accessors | `generateStaticParams` |
| `src/app/products/[id]/page.tsx` | product/brand/branch accessors | `generateStaticParams` |
| `src/app/delivery/[productId]/page.tsx` | product/branch/agent accessors | `generateStaticParams`; this is the delivery-routing page |
| `src/app/agents/page.tsx` | `deliveryAgents` | Computes the city list at module scope — must move inside the component |
| `src/app/search/page.tsx` | `products` | Only for `products.length` in the metadata |
| `src/app/sitemap.ts` | `brands`, `branches`, `products`, `getBrandById` | Already async-capable |

### Why server components make most of this tractable

Every file in that table except one is a server component or a route module.
They already run on the server, they may already be `async`, and Next.js awaits
them before rendering. So the change really is:

```diff
-import { getBrandBySlug } from "@/data";
+import { getBrandBySlug } from "@/server/repositories";
...
-const brand = getBrandBySlug(slug);
+const brand = await getBrandBySlug(slug);
```

`generateStaticParams` is likewise already allowed to be `async`, so the four
that currently return synchronously just gain an `await`. No component becomes a
client component, no data crosses the network boundary that did not already, and
no serialisation format changes — the repository returns the same plain objects.

### The two genuinely hard spots

1. **`src/lib/search.ts` → `src/components/search/SearchExplorer.tsx`.**
   `search.ts` imports `brands`, `branches` and `products` at module scope and
   builds the `Listing[]` join in `getListings()`. `SearchExplorer` is a
   `"use client"` component and calls `searchProducts(filters)` with the default
   `listings = getListings()` argument, so the entire catalogue is currently
   bundled into the client and filtered in the browser.

   That cannot simply await a database call. The fix is to split `search.ts`
   into a pure, data-free scoring/filtering half (stays client-safe) and a
   loading half that runs on the server, then have `src/app/search/page.tsx`
   load the listings and pass them to `SearchExplorer` as a prop —
   `searchProducts` already accepts `listings` as its second parameter, so the
   seam exists. Alternatively move filtering server-side behind a route handler
   or server action, which is the better answer once the catalogue outgrows
   what is reasonable to ship to a phone on a Tanzanian mobile connection.

2. **`src/components/three/HeroScene.tsx`** is a `"use client"` component that
   imports `brands` directly for the orbiting logos. It needs the brand list
   passed down as a prop from a server parent. Small, but it is a real prop-drill
   through `HeroSceneLoader`/`CanvasWrapper`.

### Also worth deciding before cutover

- **Caching.** Every page currently prerenders from constants. Once pages hit a
  database, decide per route between `generateStaticParams` + ISR and dynamic
  rendering, or the build will query the database once per generated path.
- **Type ownership.** The repository imports the domain types from
  `@/data/types` and re-exports them, so the two implementations are provably
  the same shape. When `src/data` is retired, `types.ts` should move (to
  `src/server/` or a shared `src/types/`) and that import updated — one line.
- **Authentication** is out of scope for this phase and no user/session model
  exists yet.
