# Getting Soko online

Written 2026-08-27. This is the runbook for closing **debt #2** — no git remote,
no deployment — and it is the only thing standing between the current build and
a live site.

Everything here is an owner action. None of it can be delegated to an engineer,
because every step needs an account or a credential that is yours.

Budget about twenty minutes end to end. Steps 1 and 2 are ten of it, and they
are the two that unblock everything else in the repo — CI (#1) has never once
run, and mutation testing (#11) is sequenced behind them.

---

## Before you start

Nothing in this document asks you to paste a password, a key or a connection
string into a chat. Every secret goes directly from the place that issues it
into the place that consumes it. If any instruction ever seems to ask otherwise,
stop — that is not this document.

---

## 1. A git remote (10 minutes, unblocks the most)

44 commits currently exist on exactly one disk. A dropped laptop is the end of
this project. This is the highest-leverage thing you can do today and it is
almost entirely typing.

1. Create an **empty private repository** on GitHub — no README, no `.gitignore`,
   no licence. GitHub offers to add all three; decline. An initialised remote
   means your first push is a merge conflict instead of a push.
2. From the repository root:

   ```bash
   git remote add origin https://github.com/<you>/soko.git
   git push -u origin master
   ```

   The folder on disk is `brand-marketplace` and the project calls itself Soko
   everywhere inside it. Name the repository whichever you intend to live with —
   git does not care that they differ, and renaming the local folder later is
   safe.

3. Confirm `.env` and `.env.local` are **not** in the push:

   ```bash
   git ls-files | grep -E "^\.env"
   ```

   That must print nothing. If it prints anything, stop and remove it from the
   index before continuing — a service-account key in a git history is not
   fixed by a later deletion.

**What this unblocks:** `.github/workflows/ci.yml` already exists and has never
executed. It starts running on your next push.

---

## 2. The database — already live

Your Supabase project (**eu-west-1**, Postgres **17.6**, ref `nnrcjeowivnbzdkwxxrm`)
was paused; it is now `ACTIVE_HEALTHY` and **already migrated and seeded**:

```
tables 13 · foreign keys 12 · indexes 39
brands 6 · branches 19 · products 38 · specs 89 · couriers 5 · regions 8
own fleet 6 of 19 · verified 12 of 19 · prices 2,000 – 245,000,000 TZS
```

Every figure matches the SQLite source exactly. **You do not need to run
`prisma migrate deploy` against it** — that step is done.

### Row Level Security — leave it alone

Supabase auto-enabled RLS on all 13 tables, with **no policies**. For Soko that
is exactly right and not an oversight to fix:

- The app reaches Postgres through **Prisma as the `postgres` role**, which
  bypasses RLS entirely. Nothing breaks.
- PostgREST and the public **anon key can read nothing**. That matters: `Order`
  holds customer names, phone numbers and home addresses, and the anon key is
  shipped to every browser by design. With RLS off, anyone holding it could read
  the lot.

**Do not add permissive policies** unless you later adopt Supabase's client
libraries — that would open the exact hole RLS is currently closing.

### Connection strings

| Which | Port | Use it for |
|---|---|---|
| **Session / direct** — `db.nnrcjeowivnbzdkwxxrm.supabase.co` | 5432 | Migrations, from your laptop or CI |
| **Transaction pooler** — the `pooler.supabase.com` host | 6543 | The deployed app. Required. |

Copy both from **Supabase → Project Settings → Database → Connection string**
rather than composing them; Supabase has changed pooler hostnames before.

**Why the pooler is not optional.** Every serverless invocation opens its own
connection. A few hundred concurrent requests against the direct connection
exhausts Postgres' connection limit and the site returns 500s under exactly the
traffic you want. Append `?pgbouncer=true&connection_limit=1` for Prisma.

---

## 3. The one real gotcha — read before you push

**Setting `DATABASE_URL` is not enough to move this app to Postgres.** This was
measured on 2026-08-27, not assumed, and it contradicts what the schema header
and an earlier draft of this document implied.

Three separate things bind the app to one provider:

1. The committed migrations emit `DATETIME` and `REAL`; Postgres needs
   `TIMESTAMP(3)` and `DOUBLE PRECISION`. They cannot be replayed there.
2. `provider = env("DATABASE_PROVIDER")` is **rejected** by `prisma validate`.
   The provider must be a literal.
3. The **generated client** is bound to it too. Handing `PrismaPg` to a client
   generated from a `sqlite` schema throws at construction.

The good news: the app itself runs on Postgres perfectly. It was seeded and read
back through `seedDatabase()` and the real repository layer against a live
Postgres 16 — 6 brands, 19 branches, 38 products, coordinates, ETAs and specs
all mapping correctly. **One build serves one provider**, and that is the whole
of the constraint.

`src/server/db/client.ts` now refuses a mismatch with an error that says what to
do, rather than failing deep inside Prisma.

### Switching the repo to Postgres

Do this **before** the first push, because of the next paragraph:

```bash
# 1. Flip the provider
#    prisma/schema.prisma        provider = "postgresql"
#    src/server/db/client.ts     SCHEMA_PROVIDER = "postgresql"

# 2. Regenerate the client
npx prisma generate

# 3. Replace the migration folder with Postgres DDL
#    (Supabase is already migrated — this is for CI and fresh environments)
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script \
  > prisma/migrations/00000000000000_init_postgres/migration.sql
```

**The cost, stated plainly:** SQLite dev goes away. `npm run dev` with no
`DATABASE_URL` stops working, and every integration test that builds a throwaway
SQLite file — `repositories`, `parity`, `status.integration`,
`submissions.integration` — needs a Postgres to point at instead. That is a real
trade, which is why it is your call and not one I made for you.

The alternative is two schema files and a generate step keyed to the
environment. It keeps the fast SQLite tests and adds a build step. Neither
option is obviously right.

---

## 4. Deploy the app

**Your GitHub is already connected to Vercel, so the first push auto-deploys.**
That is convenient and it is also the trap: the build runs
`generateStaticParams`, which **queries the database**. A push with no
`DATABASE_URL` set in Vercel fails the build.

So the order is: set the environment variables **first**, switch the provider
**second**, push **third**.

### Environment variables

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the **pooled** string, port 6543 | with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | the **direct** string, port 5432 | migrations only |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from Firebase console | public identifier, not a secret |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | " | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `v-mall-f37c6` | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | " | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | " | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | " | |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` | reCAPTCHA v3 **site** key | public by design |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | the JSON key, one line | **a real secret** |

`.env.example` explains the Firebase split at length. Everything with a
`NEXT_PUBLIC_` prefix ships to every visitor by design; the service-account key
must never acquire that prefix — it grants full project access and bypasses both
Security Rules and App Check.

Paste it straight from the Firebase console into Vercel's field. It should not
pass through a file or a chat.

**Without it**, sign-in degrades gracefully — a supported configuration per
`.env.example` — and `/account`, `/admin` and the partner review queue are
unavailable. The catalogue, search, the locator and the order flow all work.

## 5. After the first deploy

In this order:

1. **Skip the migration.** Supabase is already migrated and seeded — verify
   with a row count rather than re-running it.
2. **Open the site and use it.** The standing rule in this repo, and it has
   earned its keep twice: two bugs escaped the entire test suite and were caught
   by a human clicking. Place an order. Read the confirmation screen.
3. **Check `/` against `docs/design/screens/`.** The generative field is seeded,
   so the hero should be pixel-identical to `home-desktop-01.jpg`. If it differs,
   something is wrong with font loading or the canvas, not with the seed.
4. **Turn on App Check enforcement** — but only after reading the monitor-only
   metrics. `docs/auth.md` has the sequence. Flipping it blind can lock out real
   users you cannot see.

---

## What is still not done after all of this

Being online is not being finished. In rough order of how much they matter:

- **No payments.** The fee module computes correctly and is barred from every
  customer surface. Going live does not change that, and nothing on the site
  should imply it has.
- **The confirmation screen still lies.** It tells customers their request "has
  not been transmitted to anyone" while the server writes their name, phone and
  address to the database. Verified by submitting a real order and querying the
  row. **Fix this before any real customer sees it** — `docs/assignments/beacon-04.md`
  is written and ready.
- **7 of 19 branches and 3 of 5 couriers are unverified placeholders**, and no
  address is geocoded. A live site with invented branch addresses is a different
  kind of problem from a prototype with them. `docs/assignments/mercury-06.md`.
- **Brand logos are trademarks used without agreement.** Nominative fair use
  covers identification; commercial operation is a conversation to have with
  each brand. `docs/design/` has the fallbacks costed.
- **No retention policy** for the customer PII now stored at rest (#20).

`docs/assignments/README.md` lists all thirteen owner items with what each one
unblocks.

---

## Rolling back

Vercel keeps every deployment. Promoting a previous one is two clicks in the
dashboard and takes effect immediately — no rebuild, no git revert.

A **database** migration is the one thing that does not roll back that way.
Before any migration against production data, take a backup from the Supabase
dashboard. Prisma's forward-only migrations have no down step by design.
