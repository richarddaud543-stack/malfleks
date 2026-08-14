# Backend foundation

Soko's catalogue currently lives in hand-written TypeScript arrays under `src/data/`.
This document covers the database that will eventually replace them: the Prisma
schema, how to run it locally, how to move it to Postgres, and what is left to do
before the site actually reads from it.

**Status: the site does not use the database yet.** `src/data/` is still the only
thing any page imports. Everything described here runs alongside it. That is
deliberate — see [Remaining cutover work](#remaining-cutover-work).

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
parent. Deleting a brand cannot leave orphaned products. This is right *today*,
when the catalogue is the only thing in the database. Once orders reference
branches and products, revisit it — an order pointing at a deleted branch is a
worse outcome than a failed delete.

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

That pruning is safe only because nothing else writes to these tables yet. **When
orders arrive, replace the prune with a soft delete or drop it** — deleting a
branch an order points at is not a seed script's decision to make. This is
flagged in the code as well.

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
