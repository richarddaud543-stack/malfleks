# Phase 0 research — ENG-7 · Vault — cloud platform & security (2026-08-15)

Assignment: current professional practice on Firestore Security Rules, Firebase
App Check, Firebase Auth in a Next.js App Router app, the Admin SDK on the
server, and Firestore cost/quota traps — then what it means for Soko
specifically, given debt #14 (two persistence stacks) and #16 (no rules, no
App Check, nothing reads Firebase yet).

Read first, before any web lookup: `src/lib/firebase.ts`,
`src/components/firebase/FirebaseAnalytics.tsx`, `.env.example`,
`src/server/repositories/index.ts`, `prisma/schema.prisma`, `docs/backend.md`,
and `docs/engineering-standards.md` in full. Then ~13 fetches: Google's own
Firestore/App Check/Admin SDK/Auth docs, one Next.js-ecosystem community doc,
two search sweeps for real-world rule mistakes and Next-App-Router auth
patterns, and — because it turned out to be load-bearing — three files out of
this repo's own `node_modules/next/dist/docs/`, which are the exact-version
Next 16.3.0 docs `AGENTS.md` already told me to prefer over training data.

## 1. Who to learn from

- **Firebase's own docs (firebase.google.com/docs)** — authoritative for
  everything product-specific: rules syntax, App Check providers, Admin SDK
  setup, session cookies, quotas. Used directly below; every claim in §2 that
  isn't marked otherwise traces to one of these pages.
- **The `next` package's own bundled docs**
  (`node_modules/next/dist/docs/...`), version-matched to the exact Next
  16.3.0 this repo runs. `AGENTS.md` already flags this repo as having
  breaking changes from training data — that turned out to be true for
  Middleware/Proxy specifically (§4), so this source outranks anything else
  for Next-specific auth architecture questions.
- **`next-firebase-auth-edge`** (community library, MIT, actively maintained,
  docs at next-firebase-auth-edge-docs.vercel.app) — the de facto standard for
  Firebase Auth + Next.js session cookies when Middleware had to run on the
  Edge runtime. Worth knowing about even though §4 found the specific problem
  it solves no longer applies to us by default. Secondary source — I read its
  docs pages, not a video, and did not verify its source code.
- **Google Cloud's "Fix insecure rules" doc**
  (`firebase.google.com/docs/firestore/security/insecure-rules`, mirrored at
  `cloud.google.com/firestore/native/docs/security/insecure-rules`) — Google's
  own catalogue of the rule mistakes that actually cause incidents, which is a
  better source than any aggregator for "what goes wrong in practice."
- **Blog aggregators** (`vibe-eval.com`, a Medium post on exploiting Firestore
  rules) — used only for the "test mode left in production" pattern in §2,
  and treated as illustrative, not authoritative; every specific claim from
  them is corroborated by the official "Fix insecure rules" page above.
  Flagged as secondary. No video sources were used or claimed.

## 2. What current practice says, by theme

### Security Rules: structure

A rules file is a `service cloud.firestore` block scoping `match` statements
under `match /databases/{database}/documents`. Standard shape:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cities/{city} {
      allow read: if <condition>;
      allow write: if <condition>;
    }
  }
}
```

`rules_version = '2'` matters concretely: v1 recursive wildcards (`{path=**}`)
must match one-or-more segments and must be the last segment in the match
statement; v2 wildcards can match zero-or-more and can appear mid-path. Rules
only apply at the exact path matched — a rule on a collection does **not**
cascade to its subcollections; each needs its own `match` block, nested or
not. When more than one rule matches a request, access is granted if **any**
matching rule evaluates true (`OR` semantics, not `AND`) — this is the single
most common source of an accidentally-too-permissive ruleset.

Granular operations: `read` splits into `get` (single-document reads) and
`list` (queries); `write` splits into `create`, `update`, `delete`. `request`
describes the incoming operation (`request.auth`, `request.resource.data` —
the data being written); `resource` describes the document as it currently
exists in the database (`resource.data`). A rule that checks
`resource.data.ownerId == request.auth.uid` on `update` is checking the
document that's already there; checking `request.resource.data.ownerId`
instead checks what the client is trying to write — using the wrong one is
how "users can't edit others' documents" quietly becomes "users can't stop
someone else from taking over their own document."

Example shapes, straight from Google's docs:

```
// Public read, no client write at all
match /documents/{document=**} {
  allow read: if true;
  allow write: if false;
}

// Owner-only, keyed by uid in the path
match /collections/{uid}/documents/{document=**} {
  allow read, write: if request.auth.uid == uid;
}
```

Sources: [Get started with Security Rules](https://firebase.google.com/docs/firestore/security/get-started) ·
[Security Rules structure](https://firebase.google.com/docs/firestore/security/rules-structure)

### Security Rules: testing

Google ships `@firebase/rules-unit-testing`, built to run against the local
Firebase Emulator Suite only — it "never touches your production resources."
`initializeTestEnvironment()` loads the actual `firestore.rules` file from
`firebase.json`; `authenticatedContext()` / `unauthenticatedContext()` create
simulated clients; `assertSucceeds()` / `assertFails()` are the two
assertions almost every test reduces to. `withSecurityRulesDisabled()` seeds
fixture data without the rules getting in the way of test setup itself. This
is a normal async/await Vitest-shaped workflow and fits directly into a CI
job the way `src/server/repositories/repositories.test.ts` already exercises
a real (SQLite) database rather than mocking one — same philosophy, different
product.

Source: [Test your Security Rules](https://firebase.google.com/docs/rules/unit-tests)

### Security Rules: catastrophic mistakes actually seen in production

Google's own "Fix insecure rules" doc names three specific patterns, not just
"be careful":

1. **`allow read, write: if true`** left over from prototyping — reachable by
   anyone who can guess or find the project ID, which is not a secret (it's
   often in the client bundle by design, as `src/lib/firebase.ts` already
   documents correctly for the API key).
2. **`request.auth != null` and nothing else** — proves *someone* is logged
   in, proves nothing about *which* data they should reach. This is the
   difference between "authenticated" and "authorized," and it's the rule
   shape that lets any signed-in user read or overwrite any other user's
   documents.
3. **Domain checks without `email_verified`** — `request.auth.token.email.matches('.*@company[.]com')`
   without also checking `request.auth.token.email_verified` lets anyone
   register an unverified address at that domain.

Community-sourced (secondary, corroborated by the pattern above rather than
independently verified): real breaches attributed specifically to databases
still in Firebase's default "test mode" — a 30-day `allow read, write: if
request.time < <expiry>` rule that Firebase itself generates when you choose
"start in test mode" in the console, which silently reverts to deny-all when
the timer expires but is routinely never revisited before then, and is
routinely never revisited *because* it doesn't look like a live vulnerability
until the 30 days are up.

Sources: [Fix insecure rules](https://firebase.google.com/docs/firestore/security/insecure-rules) ·
[Firebase Security Rules: 12 Common Mistakes, vibe-eval.com](https://vibe-eval.com/backend-security/firebase-security-rules/) (secondary) ·
[Exploiting Firestore Database Rules, Medium](https://medium.com/@S3THU/exploiting-firestore-database-rules-a-pathway-to-data-breaches-aa945476cc16) (secondary)

### App Check

App Check attaches an attestation token to every request that proves it came
from your actual app on an unmodified device, and rejects requests without
one once enforcement is turned on for a given product (Firestore, Storage,
callable Functions, Auth). Web providers are reCAPTCHA v3 (invisible,
score-based, no user challenge) or reCAPTCHA Enterprise. Setup is
client-side:

```js
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("YOUR_SITE_KEY"),
  isTokenAutoRefreshEnabled: true,
});
```

Google's explicit recommendation: run in **monitor-only** mode first, look at
the App Check metrics in the console, and only flip a product to
**enforced** once you're confident legitimate traffic isn't being scored out
— enforcing blind risks locking out real users.

The detail that matters most for Soko: **App Check only covers requests made
with a client SDK.** Admin SDK calls run under a service account with
elevated trust and bypass both Security Rules and App Check entirely — by
design, the same way a `psql` connection with the Postgres superuser bypasses
row-level security. This is not a documented SSR limitation to work around;
it means App Check is only a meaningful investment for the *specific*
Firestore paths a browser talks to directly.

Sources: [App Check overview](https://firebase.google.com/docs/app-check) ·
[App Check: reCAPTCHA v3 provider (web)](https://firebase.google.com/docs/app-check/web/recaptcha-provider)

### Admin SDK on the server

Server-side access uses a service account key, not the public web config.
Google's stated pattern is Application Default Credentials via
`GOOGLE_APPLICATION_CREDENTIALS` pointing at a downloaded JSON key (Console →
Project Settings → Service Accounts → Generate New Private Key), auto-picked
up in Google-hosted runtimes (Cloud Run, Cloud Functions, App Engine) and
explicit elsewhere. The documentation is blunt that this key is genuinely
sensitive — "extremely high security awareness is required" — which is the
exact inverse of the public web API key already correctly documented in
`.env.example`. **The two must not be handled the same way**: the web config
is meant to ship in the client bundle; a service account key must never reach
one, must never be committed, and belongs in a `.env.local` / deployment
secret store that `.env.example` should describe but never populate.

Source: [Firebase Admin SDK: Add the SDK to your server](https://firebase.google.com/docs/admin/setup)

### Firebase Auth: session cookies for server-rendered apps

Google documents session cookies specifically as the SSR-appropriate
alternative to handing the client SDK's short-lived ID token around:

1. Client signs in with the Firebase client SDK (persistence `NONE` so the
   client doesn't also maintain its own long-lived session), gets an ID
   token, POSTs it to a server endpoint.
2. Server calls `getAuth().createSessionCookie(idToken, { expiresIn })` via
   the **Admin SDK** — this both verifies the ID token and mints a cookie,
   configurable from 5 minutes to 2 weeks, set `httpOnly`/`secure`.
3. Every subsequent request is verified server-side with
   `verifySessionCookie(cookie, checkRevoked)` — the `checkRevoked` variant
   additionally checks Firebase's own revocation list, catching a disabled or
   deleted account without waiting for the cookie to expire on its own.

Google recommends validating `auth_time` before minting the cookie (reject
if the sign-in is stale) and pairing this with your own CSRF token, since a
cookie is sent automatically by the browser on every request, unlike a
manually-attached bearer token.

Source: [Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)

### Firestore cost and quota traps

Firestore bills **per document read/write/delete operation**, not per byte —
a query that matches 500 documents costs 500 reads even if you only render
three fields from each. The free tier is genuinely small for anything with
real traffic: **50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1
GiB stored, one free database per project.** Modeling traps that turn into
real bills:

- **Offsets don't save reads.** `.offset(20)` still reads and discards the
  skipped 20 documents server-side; use a cursor (`startAfter`) instead.
- **Monotonic document IDs** (auto-incrementing or timestamp-prefixed) create
  write hotspots because Firestore shards by key range — high-rate writes to
  lexicographically adjacent keys contend on the same shard. Firestore's
  auto-generated IDs deliberately scatter for this reason.
- **The "500/50/5" ramp rule**: a brand-new collection shouldn't be hit with
  more than ~500 ops/sec on day one; grow by 50% every 5 minutes rather than
  spiking, so Firestore's automatic sharding has time to react.
- **1 MiB document size cap**, ~1,500-byte indexed-field truncation, 40,000
  index entries/document, 20 levels of map/array nesting — all hard ceilings,
  not soft warnings.
- Deletes, TTL policies, PITR, backups, and restores require billing enabled
  even under otherwise-free usage — a project can be "in the free tier" and
  still generate a bill from an operational feature turned on incidentally.

Sources: [Best practices for Cloud Firestore](https://firebase.google.com/docs/firestore/best-practices) ·
[Cloud Firestore quotas and limits](https://firebase.google.com/docs/firestore/quotas)

## 3. What this means for Soko

### What must exist before a single Firestore read ships

In order, because each depends on the last:

1. **A decision on debt #14** (§ below) — if Firestore isn't going to be the
   catalog's backend, none of the rest of this section is urgent work; it's
   groundwork for whatever *does* eventually read Firebase (Auth-backed
   orders, most likely, per the architecture below).
2. **A `firestore.rules` file, default-deny, one `match` block per
   collection**, committed to the repo — not written in the Firebase
   console, where it isn't reviewed and isn't versioned. A shape for this
   catalog specifically:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       // Catalogue: public-read, no client writes ever. Ingestion happens
       // server-side via the Admin SDK, which bypasses these rules entirely —
       // that's the intended path, not a gap.
       match /brands/{brandId} {
         allow read: if true;
         allow write: if false;
       }

       match /branches/{branchId} {
         allow read: if true;
         allow write: if false;
       }

       match /products/{productId} {
         allow read: if true;
         allow write: if false;

         match /specs/{specId} {
           allow read: if true;
           allow write: if false;
         }
       }

       match /deliveryAgents/{agentId} {
         allow read: if true;
         allow write: if false;
       }

       // If/when customers sign in to place orders (not built yet):
       match /orders/{orderId} {
         allow create: if request.auth != null
                       && request.resource.data.customerId == request.auth.uid
                       && request.resource.data.status == 'pending';

         allow read, update: if request.auth != null
                       && resource.data.customerId == request.auth.uid;

         // No client update once accepted, and no client delete — a
         // cancellation is a status write ("cancelled"), not a document
         // removal, so there's always an audit trail.
         allow update: if request.auth != null
                       && resource.data.customerId == request.auth.uid
                       && resource.data.status == 'pending'
                       && request.resource.data.status in ['pending', 'cancelled'];
         allow delete: if false;
       }

       // Everything else: no matching rule, so implicit deny. Left
       // uncommented on purpose — a catch-all `match /{document=**}` with
       // `allow read, write: if false` adds nothing but is fine as a
       // documentation device if the team wants the deny stated explicitly.
     }
   }
   ```

   This directly targets the "insufficient auth check" and "OR-semantics
   surprise" failure modes in §2: every collection either denies all client
   writes outright, or scopes both create and update to
   `request.auth.uid == resource-owner`, and there is exactly one rule per
   path so there's no second, more permissive match to accidentally OR
   against.

3. **Rules tests**, `@firebase/rules-unit-testing` against the Emulator
   Suite, both directions per collection (an unauthenticated read of
   `/brands/{id}` succeeds; an unauthenticated *write* to it fails; a
   customer reading someone else's `/orders/{id}` fails). This is the same
   "don't trust it until a real test exercises it" standard the repository
   layer already holds itself to in `repositories.test.ts` — the emulator
   suite is the equivalent tool for rules the way `prisma migrate deploy`
   against a temp SQLite file is for the schema.
4. **CI wiring** for the rules tests specifically — `.github/workflows/ci.yml`
   already exists (debt #1) and is described as "inert until #2 [git
   remote] is closed." Add the rules-test job to that same file now, so it's
   ready the moment #2 closes rather than a follow-up someone has to
   remember.
5. **Service account handling** decided and documented in `.env.example`
   *before* any Admin SDK code is written — as a clearly-marked contrast to
   the public web config already there (§2, Admin SDK).

App Check is deliberately **not** on this list as a precondition. Given the
architecture recommended below (server-side reads via the Admin SDK), App
Check has nothing to protect yet — it only matters once a client component
talks to Firestore directly, which nothing in this repo does or currently
needs to.

### How Auth should work here, given server-rendered pages

Soko's pages are server components; nothing today authenticates a user. If
customers ever sign in — order history, saved addresses, order status — the
architecture Google's own Next.js docs describe (App Router Authentication
guide, `node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
version-matched to this repo's Next 16.3.0) maps onto Firebase Auth almost
exactly:

- **Client-side sign-in only.** `signInWithEmailAndPassword` /
  `signInWithPopup` etc. run in a client component, same as `firebase.ts`
  already isolates Analytics to the client.
- **Exchange the ID token for a session cookie on the server**, via a Route
  Handler, using the Admin SDK's `createSessionCookie` (§2). This is the
  Firebase-specific implementation of the exact pattern Next's own docs
  recommend generically: "Cookies should be set on the server to prevent
  client-side tampering."
- **A Data Access Layer**, not scattered `verifySessionCookie` calls. Next's
  docs prescribe a `verifySession()` function wrapped in React's `cache()`,
  called from Server Components, Server Actions, and Route Handlers — one
  choke point, memoized once per render pass. For Soko this is
  `src/server/auth/dal.ts` (new), a `verifySession()` that calls
  `getAuth().verifySessionCookie(cookie, true)` (the revocation-checking
  form) and either returns the decoded claims or redirects. Everything that
  needs "is someone logged in, and who" — an order-history page, a
  `placeOrder` Server Action — calls this, not the cookie directly.
- **Proxy (`proxy.ts`, ex-Middleware) stays optimistic-only**, per Next's own
  explicit warning: "since Proxy runs on every route, including prefetched
  routes, it's important to only read the session from the cookie
  (optimistic checks), and avoid database checks." A decoded-but-unverified
  cookie read is fine there for a redirect-to-login UX; the authoritative
  `verifySessionCookie` call belongs in the DAL, close to the data, same as
  Next recommends for any auth provider. Their docs are pointed about why:
  "A matcher change or a refactor... can silently remove Proxy coverage.
  Always verify authentication and authorization inside each Server Function
  rather than relying on Proxy alone."
- **Never gate a Server Component tree on client-side Firebase Auth state.**
  `onAuthStateChanged` doesn't exist during SSR — the client SDK's notion of
  "signed in" isn't available to a server component at all. The session
  cookie is the only thing a server component can actually check.

Concretely, this needs no new dependency (`next-firebase-auth-edge` or
similar) — see §4 for why the reason that library exists doesn't bind this
repo the way it binds most Next.js + Firebase projects still on Middleware's
old Edge default.

### Debt #14 — Firestore vs. the existing Prisma/SQLite layer, for *this* product

**Recommendation: keep Prisma/Postgres as the catalog's source of truth. Retire
or scope-limit the Firebase SDK to Auth (and, if desired, Analytics), and say
so explicitly in `docs/backend.md`.** Reasoning, including the case against
Firestore that a "just use Firestore, it's already wired in" instinct would
skip:

**The case for Firestore** — genuinely real, just not decisive here: no
server to operate, scales writes/reads without capacity planning, native
offline support and realtime listeners if the product ever wants live
inventory or order-status push updates on a customer's phone, and it's
already configured (`v-mall-f37c6`, `src/lib/firebase.ts`).

**The case against Firestore, specifically for Soko's catalog:**

- **The data is relational and the modeling shows it.** `prisma/schema.prisma`
  has real foreign keys (`Product.branchId`/`brandId`, cascading deletes),
  join tables chosen *specifically* for indexed queries (`AgentRegion` for
  "which couriers serve city X" — `docs/backend.md` calls out that this earns
  its keep immediately), and a documented, tested denormalization
  (`Product.brandId`) with an invariant the seed actively asserts. Firestore
  has no joins and no cross-document transaction-checked foreign keys; this
  entire relational structure would need re-deriving as duplicated,
  manually-synchronized fields, which is exactly the class of bug
  `docs/backend.md` already flags debt #8 for (`Branch.coords` silently
  diverging between two stores) — Firestore doesn't remove that risk, it
  generalizes it to every relation in the schema.
- **The free-tier read budget doesn't fit a public catalog.** 50,000
  reads/day (§2) sounds generous until every product-page render is a
  document read — with 38 products today that's nothing, but the repository
  layer's own doc-comment already anticipates "fine at 38 products,
  untenable at 38,000" for a different reason (debt #6); the same math
  applies to read billing once product count and traffic both grow, and
  Firestore's cost model charges per-document-read regardless of payload
  size, so a paginated product list is N reads even if N-1 of them are
  discarded client-side.
- **Prisma is closer to done and already proven against this exact schema.**
  21 repository tests deep-equal every DB-backed accessor against the static
  data; the Postgres cutover is documented as a same-shape, four-file change
  with no model or query rewrite (`docs/backend.md`, "Switching to
  Postgres"); the app already has an unfinished-but-charted cutover path
  (`docs/backend.md`, "Remaining cutover work") that only needs the two hard
  spots (`SearchExplorer`, `HeroScene`) resolved. Firestore has none of that
  invested and would start from zero on rules, testing, and a data model
  redesign.
- **A public-read, admin-written catalog gets nothing from Firestore's
  actual strengths.** Offline sync and realtime listeners matter for
  collaborative or live-updating client state; Soko's catalog changes on
  ops's schedule, not in response to concurrent users editing it. The one
  place realtime *would* matter — order status — is a small, well-scoped
  slice that could live in Firestore deliberately without dragging the whole
  catalog along.

**A middle path worth naming explicitly, since "all or nothing" is a false
choice**: keep Prisma/Postgres as the catalog's source of truth (what it's
already built for and tested against), and let Firestore own only
Auth-adjacent, genuinely realtime data if that's ever built — order status,
notifications. That uses Firestore for what it's actually good at instead of
as a second copy of relational data, and it's the option that requires
retiring the least already-working code.

## 4. Where I was wrong

- **I assumed Next.js Middleware forces the Edge runtime**, which is why
  entire community libraries like `next-firebase-auth-edge` exist — the
  Admin SDK needs Node.js APIs Edge doesn't provide, so historically you
  either used a Node-safe reimplementation of JWT verification or a library
  built to do that for you. This repo's own bundled docs
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
  line 223, and its version table at line 774) say the opposite for Next
  16.3.0: **"Proxy defaults to using the Node.js runtime,"** as of v16.0.0,
  Middleware having been renamed to Proxy in the same release. The Admin SDK
  can run directly in `proxy.ts` here if it's ever needed there. This
  doesn't change the recommendation above — Next's own docs still say Proxy
  should stay optimistic-only regardless of which runtime it's on — but it
  means the specific *justification* ("Edge can't run the Admin SDK") that
  makes `next-firebase-auth-edge` close to mandatory on most Next.js/Firebase
  projects doesn't bind this one. Worth flagging because grabbing that
  library reflexively, on the reasonable-sounding assumption it's required
  here, would add a dependency this repo doesn't need.
- **I expected App Check to be an unconditional early priority** once real
  Firestore data existed, given how the debt register frames #16 ("no
  Security Rules or App Check"). Reading how App Check actually works
  changed that: it protects client-SDK requests specifically, and Admin SDK
  requests bypass it by design (§2) — not a gap, the intended trust
  boundary. Given the server-side-reads architecture this doc recommends,
  App Check has nothing in Soko's current or near-term plans to protect. It
  belongs on the list the day a client component calls Firestore directly,
  not before.
- **I expected the free Firestore tier to comfortably absorb a small
  marketplace's read volume.** 50,000 reads/day is easy to exceed with
  nothing more exotic than normal traffic hitting uncached product pages —
  sharper than I'd have guessed, and it's a concrete number worth the Lead
  having rather than a vague "reads cost money."

## What I could not verify

- Anything in `next-firebase-auth-edge`'s actual source (only read its docs
  pages) — treated as a secondary, unverified source throughout.
- The `vibe-eval.com` and Medium posts on real-world breaches are blog
  aggregation, not incident reports I could independently confirm; used only
  where the official "Fix insecure rules" page corroborates the same pattern.
- I did not run, deploy, or authenticate against the live `v-mall-f37c6`
  project, per the assignment's rules — nothing above reflects that
  project's actual current rules, quota usage, or App Check status, only
  what the documented defaults and this repo's code currently are.
- No video sources were used or cited anywhere in this document.
