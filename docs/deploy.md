# Getting MalFleks online

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

## 1. A git remote — done

`https://github.com/richarddaud543-stack/malfleks.git` is the remote and `master` is
pushed. `.github/workflows/ci.yml` had never executed in its life; it now runs on
every push and pull request.

One thing to confirm once, if you have not:

```bash
git ls-files | grep -E "^\.env"
```

That must print nothing. If it prints anything, stop and remove it from the index
— a service-account key in a git history is not fixed by a later deletion.

The branch stayed `master` rather than `main` on purpose: the workflow triggers
on `master`, and renaming the branch without renaming the trigger would have
switched CI off silently on the very push that was meant to turn it on.

---

## 2. The database — already live

Your Supabase project (**eu-west-1**, Postgres **17.6**, ref `nnrcjeowivnbzdkwxxrm`)
was paused; it is now `ACTIVE_HEALTHY` and **already migrated and seeded**:

```
tables 15 · brands 6 · branches 19 · products 38 · couriers 5
own fleet 6 of 19 · verified 12 of 19 · prices 2,000 – 245,000,000 TZS
```

Counts re-verified against the live database on 2026-08-31. It was 13 tables
until `SavedOrderRequest` and Prisma's own `_prisma_migrations` were added.
**You do not need to run `prisma migrate deploy` against it** — that step is
done.

### Row Level Security — leave it alone

Supabase auto-enabled RLS on all 15 tables, with **no policies**. For MalFleks that
is exactly right and not an oversight to fix:

- The app reaches Postgres through **Prisma as the `postgres` role**, which
  bypasses RLS entirely. Nothing breaks.
- PostgREST and the public **anon key can read nothing**. That matters: `Order`
  holds customer names, phone numbers and home addresses, and the anon key is
  shipped to every browser by design. With RLS off, anyone holding it could read
  the lot.

**Do not add permissive policies** unless you later adopt Supabase's client
libraries — that would open the exact hole RLS is currently closing.

### Connection strings — there are three, and the obvious one does not work

| Which | Host | Port | Use it for |
|---|---|---|---|
| **Direct** | `db.<ref>.supabase.co` | 5432 | **Unreachable from most networks — see below** |
| **Session pooler** | `<region>.pooler.supabase.com` | 5432 | Migrations, from your laptop or CI |
| **Transaction pooler** | `<region>.pooler.supabase.com` | 6543 | The deployed app. Required. |

Copy all of them from **Supabase → Project Settings → Database → Connection
string** rather than composing them; the pooler hostname's region prefix varies
between projects and Supabase has changed the format before.

**The direct connection is IPv6-only on the free tier.** IPv4 for it is a paid
add-on. Measured 2026-08-28, and it cost an evening:

```
db.nnrcjeowivnbzdkwxxrm.supabase.co   → no A record at all
aws-0-eu-west-1.pooler.supabase.com   → 108.128.216.176
```

Most home and mobile ISPs are IPv4-only — Tanzanian ones included — so a laptop
resolves the direct host, finds nothing routable, and Prisma reports:

```
Error: P1001: Can't reach database server at `db.<ref>.supabase.co:5432`
```

Nothing in that message suggests a network-layer address-family problem, and the
first instinct is to go checking the password. **Use the session pooler for
migrations instead.** Note its username carries the project ref —
`postgres.<ref>`, not `postgres` — which is how the pooler routes you.

Every piece of general Supabase advice, including earlier drafts of this
document, says "use the direct connection for migrations". That advice assumes
IPv6. Read it as "use a *session-mode* connection", which is what actually
matters: transaction mode does not hold a session across statements and is wrong
for DDL.

**Why a pooler at all for the deployed app.** Every serverless invocation opens
its own connection. A few hundred concurrent requests against a direct
connection exhausts Postgres' connection limit and the site returns 500s under
exactly the traffic you want. Append `?pgbouncer=true&connection_limit=1` for
Prisma on the transaction pooler.

---

## 3. Postgres everywhere — done 2026-08-27

**Setting `DATABASE_URL` was never enough to move this app to Postgres.** Three
separate things bound it to one provider, all measured rather than assumed:

1. The old migrations emitted `DATETIME` and `REAL`; Postgres needs
   `TIMESTAMP(3)` and `DOUBLE PRECISION`. They could not be replayed there.
2. `provider = env("DATABASE_PROVIDER")` is **rejected** by `prisma validate`.
   The provider must be a literal.
3. The **generated client** is bound to it too. Handing `PrismaPg` to a client
   generated from a `sqlite` schema throws at construction.

The switch has now been made. `prisma/schema.prisma` says `postgresql` and the
full gate is green on Postgres: type-check, lint, a production build and **569
tests across 44 files**. (It was 596 across 47 before the Firebase removal on
2026-08-28 took the Firestore rules, session-cookie and consent suites with it —
fewer tests, and no lost guarantee: see `docs/auth.md`.)

`prisma/migrations/` holds two migrations — `20260827000000_init_postgres` for
the original 13 tables and `20260828000000_saved_order_requests` for the table
that replaced the Firestore collection.

### What that cost, and what it bought

SQLite dev is gone. `npm run dev` with no `DATABASE_URL` no longer works — it
fails at startup with an error that names the fix rather than half-working.
`.env.example` has the two connection strings.

What it bought is that `status.integration` and `submissions.integration` now
prove their concurrency guarantee on the engine you actually ship on. SQLite
serialises writes at the file level; Postgres uses MVCC with row-level locks. A
guard that holds under the first says nothing about the second.

### The trap inside the trap: `?schema=` is ignored

Worth knowing, because it cost an afternoon and it will look like a test bug if
it ever recurs. Prisma's own connection layer reads `?schema=` from the URL. A
**driver adapter does not** — the string goes to `pg`, which has no such
parameter and silently ignores it. Seven test suites that each believed they had
a private schema were all reading and writing `public`, and the symptom was
suites seeing each other's rows depending on the order they ran in.

`src/server/db/client.ts` now sets both the Prisma-side `{ schema }` option
(which qualifies generated table names) and the session-side
`options: -c search_path=...` (which covers raw SQL). Either alone leaves a hole.

### Your local database now points at production

This is the real hazard of having one provider. Two routine commands are
destructive, and nothing in their names says which database you are aimed at:

- `npm run db:seed` prunes every product not in the seed set.
- `npm run db:reset` drops the schema and replays migrations.

Both now **refuse against any host that is not localhost**, and the refusal
prints the exact opt-in if you truly mean it:

```
MALFLEKS_DESTRUCTIVE_OK=db.nnrcjeowivnbzdkwxxrm.supabase.co npm run db:seed
```

Naming the host rather than a bare `=1` is deliberate: a blanket opt-in left
exported in a shell keeps applying after `DATABASE_URL` moves to a different
database, which is precisely the accident being prevented. Seven unit tests in
`src/server/db/destructive-guard.test.ts` hold that line.

**Take a Supabase backup before you ever type that override.**

---

## 4. Deploy the app

**Your GitHub is already connected to Vercel, so every push auto-deploys.**
That is convenient and it is also the trap: the build runs
`generateStaticParams`, which **queries the database**. A push with no
`DATABASE_URL` set in Vercel fails the build — and since the provider switch,
there is no SQLite file for it to quietly fall back to.

So: set the environment variables **first**, push **second**. Until the variables
are in place, every deploy fails at the build step, and it will look like a code
problem.

### Environment variables

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the **pooled** string, port 6543 | with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | the **direct** string, port 5432 | migrations only |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nnrcjeowivnbzdkwxxrm.supabase.co` | public identifier |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase → Project Settings → API | public by design |
| `NEXT_PUBLIC_SITE_URL` | your deployed origin, no trailing slash | optional, recommended |
| `MALFLEKS_ADMIN_EMAILS` | your address, comma-separated for more | bootstrap admin access |

**There is no secret in that list, and that is the change worth noticing.** The
Firebase build needed `FIREBASE_SERVICE_ACCOUNT_KEY` — a private key granting
full project access that bypassed both Security Rules and App Check, and whose
most common failure was arriving with `\n` escaped rather than as real
newlines. Supabase Auth needs nothing of the kind for what MalFleks does.

The one secret left anywhere is inside `DATABASE_URL`, and it was already there.

> The Supabase **`service_role`** key must never be added here. It bypasses Row
> Level Security completely, and MalFleks has no use for it: Prisma reaches Postgres
> as the `postgres` role, and Supabase is used for identity only.

**One console step is not an environment variable and everyone forgets it.** In
Supabase → Authentication → URL Configuration, add
`https://<your-domain>/auth/callback` to **Redirect URLs**. Without it, sign-in
works right up to the last hop and then bounces to an error page. `docs/auth.md`
has the full sequence.

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
4. **Sign in once, yourself.** The OAuth round trip is the one path no test in
   this repo can reach — it needs a real Google client, a real callback
   allowlist entry and a real browser. Every server-side piece around it is
   tested; the hop through Google is not. If it fails, the first suspect is the
   Redirect URL above.

---

## 6. Give the admin console its own address

Optional, and off until you switch it on. With `MALFLEKS_ADMIN_HOST` unset the site
behaves exactly as it always has: `/admin` answers on whatever host is asking,
protected by `MALFLEKS_ADMIN_EMAILS` and the `app_metadata` flag and by nothing else.

Set it and `/admin` stops existing on the shop. A customer who types the URL on
the public site gets the same 404 as a misspelled brand slug — not a redirect to
sign-in, not a "you are not allowed" page, either of which would confirm there is
something there. The console answers only on the hostname you name.

Three steps, in this order, because the third one fails silently if you skip it:

1. **Add the hostname to the same Vercel project.** Project -> Settings ->
   Domains -> Add. A free `*.vercel.app` name works and costs nothing:
   `malfleks-admin.vercel.app`, if it is unclaimed. It serves the same deployment —
   there is no second project, no second build, and nothing to keep in sync.
2. **Set `MALFLEKS_ADMIN_HOST`** to that hostname, for Production, and redeploy. The
   value is the bare host, no scheme and no path. The proxy inlines it at build
   time, which is why a redeploy is needed rather than just a save.
3. **Add `https://<that host>/auth/callback`** under Supabase -> Authentication
   -> URL Configuration -> Redirect URLs. Sign-in on the admin site goes out
   through Google and has to come back to *that* hostname; Supabase refuses any
   callback not on this list, and the failure looks like the sign-in button
   doing nothing at all.

What changes once it is on: the admin hostname's root redirects to `/admin`, its
`robots.txt` says `Disallow: /`, its sitemap is gone, and every response from it
carries `X-Robots-Tag: noindex`. The public site is untouched.

Two things worth knowing before you rely on it:

- **Sessions are per-hostname.** Signing in on the admin site is a separate
  session from signing in on the shop, and signing out of one leaves the other
  alone. That is a feature — but it does mean signing in twice.
- **This is obscurity, not authorization.** `requireAdmin()` in the DAL and
  `adminSession()` in the actions are what actually decide who may read the
  queue, and they are unchanged. The hostname decides where the door is, not
  who holds the key. Which is also why a blank `MALFLEKS_ADMIN_HOST` fails *open*:
  a typo that locked you out of your own console would be a worse failure than
  the one this setting prevents.

---

## What is still not done after all of this

Being online is not being finished. In rough order of how much they matter:

- **No payments.** The fee module computes correctly and is barred from every
  customer surface. Going live does not change that, and nothing on the site
  should imply it has.
- ~~**The confirmation screen still lies.**~~ **Fixed 2026-08-29.** It told
  customers their request "has not been transmitted to anyone" while the server
  wrote their name, phone and address to the database. CI caught it on its first
  ever execution: `e2e/auth.spec.ts` asserts a signed-out submission makes no
  same-origin POST, and it had been failing silently for weeks because the suite
  had never run anywhere but a developer's machine. The owner chose the honest
  side — a signed-out request now stays in the browser tab, and neither server
  action fires without a session. The guard is in the client, not the action: an
  action that declines to write has still received the address.
- **7 of 19 branches and 3 of 5 couriers are unverified placeholders**, and no
  address is geocoded. A live site with invented branch addresses is a different
  kind of problem from a prototype with them. `docs/assignments/mercury-06.md`.
- **Brand logos are trademarks used without agreement.** Nominative fair use
  covers identification; commercial operation is a conversation to have with
  each brand. `docs/design/` has the fallbacks costed.
- **No retention policy** for the customer PII now stored at rest (#20). Hard
  delete works; scheduled expiry does not exist.
- **No bot attestation.** App Check went with Firebase and Supabase has no
  equivalent. Supabase's own auth rate limits are what stands in for it.
- **The OAuth round trip is untested by anything here.** It needs a real Google
  client, a real callback allowlist entry and a real browser. Sign in once
  yourself after the first deploy — step 4 above.

`docs/assignments/README.md` lists all thirteen owner items with what each one
unblocks.

---

## Rolling back

Vercel keeps every deployment. Promoting a previous one is two clicks in the
dashboard and takes effect immediately — no rebuild, no git revert.

A **database** migration is the one thing that does not roll back that way.
Before any migration against production data, take a backup from the Supabase
dashboard. Prisma's forward-only migrations have no down step by design.
