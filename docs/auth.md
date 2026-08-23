# Authentication and saved order requests

Owned by ENG-7 · Vault. Built 2026-08-16.

Soko lets a customer sign in with Google, and keeps the order requests they make
while signed in. Everything else about the site is unchanged: **ordering never
requires an account**, and a signed-out customer's details are still built in the
browser, held in `sessionStorage`, and transmitted nowhere.

---

## Why this scope, and not a sign-in shell

A sign-in that unlocks nothing is a login to nowhere. The problem worth solving
was already in the order flow: `createOrderRequest` writes to `sessionStorage`
under `soko:order-request`, and `/order/confirmation` reads it back. **The
request dies when the tab closes.** A customer who wrote down nothing has lost
the reference they were told to quote to the branch.

So Auth ships with the thing that makes it worth having: a request that outlives
the tab.

---

## Decision: Google sign-in, not phone

This is the decision most likely to be questioned, because Tanzania is a
phone-first market and mobile money runs on MSISDN. The evidence went the other
way for *this* feature, at *this* stage.

### The case against phone auth today

**It cannot send a single message until an operator opens a billing account.**
Firebase has required the Blaze plan for SMS verification since September 2024.
Only the first 10 SMS per day are unbilled, and the standard-plan ceiling is
3,000 sent/day (900/minute), with 150 verification requests per IP per hour.

**And it cannot send one until an operator allowlists Tanzania.** Google's SMS
region policy defaults, for new projects, to **allowing no regions at all**. A
phone sign-in button on `v-mall-f37c6` would fail for every visitor until
someone adds TZ in the console.

**It turns a public button into metered spend an attacker controls.** SMS is
billed per message sent, including codes nobody ever types, at $0.01 to roughly
$0.46 per message depending on region. SMS pumping — a bot driving verification
requests to numbers in expensive ranges — is the well-known abuse of exactly
this shape of endpoint. reCAPTCHA-based toll-fraud protection and a region
allowlist contain it; they do not remove it. Google sign-in has no per-use cost
and therefore no abuse-driven bill.

**The order form already collects and validates a Tanzanian mobile number.**
`normalizePhone()` in `src/lib/order.ts` accepts `+255`/`0` prefixes and nine
digits starting 6 or 7. Phone auth would make a customer prove a number twice,
and would conflate two genuinely different things: *the number the driver
calls* and *the number that owns the account*. Someone ordering a fridge for
their mother needs those to differ.

### The case for Google sign-in

**90.59% of mobile browsing in Tanzania is Android** (Statcounter, July 2026;
iOS 9.13%). An Android phone is set up with a Google account. The population
statistic that argues for phone — smartphone penetration is 44.74% against 167%
telecom penetration (TCRA, June 2026) — is real, and it is the right argument
for a USSD or SMS product. It is not an argument about the addressable audience
for a 3D Next.js marketplace, because everyone who reaches this site is already
on a browser on a smartphone.

**It costs nothing, needs no billing account, and works today.** Verified in a
real browser against `v-mall-f37c6`: the provider is enabled, `localhost` is an
authorized domain, and the requested scopes are exactly `openid email profile`.

### Where this decision expires

**When Soko takes money, phone becomes the right primary method** — mobile money
identity *is* the phone number, and at that point the SMS cost is a cost of
doing business rather than a cost of having a button. That is Ledger's call to
make alongside the payment rail, not a decision to pre-empt here.

Nothing in this build blocks it. Everything past `getIdToken()` is
provider-agnostic: the session cookie, the DAL, the Security Rules and the saved
requests do not know or care which provider minted the identity. Adding phone
sign-in is another button on `SignInPanel`, not a rewrite. Google also shipped
**Firebase Phone Number Verification** in May 2026, which verifies via carrier
SIM data with no OTP and no per-message fee — worth evaluating when the time
comes rather than assuming SMS.

---

## Architecture

```
browser                          server
───────                          ──────
signInWithPopup(Google)
  └─ ID token  ──────────────▶  signInWithIdToken()  [Server Action]
                                  ├─ verifyIdToken(token, checkRevoked)
                                  ├─ reject if auth_time is stale (>5 min)
                                  └─ createSessionCookie() ─▶ soko_session
                                                              httpOnly, Lax,
                                                              Secure in prod,
                                                              5 days
every later request  ──────────▶  verifySession()  [DAL, React cache()]
                                  └─ verifySessionCookie(cookie, true)
```

**Client-side sign-in only, then a server-minted cookie.** `onAuthStateChanged`
does not exist during SSR, so the client SDK's notion of "signed in" is
invisible to a Server Component. The session cookie is the only thing a
server-rendered page can check, and Google documents session cookies as the
SSR-appropriate answer.

**The client SDK uses `inMemoryPersistence`.** Firebase's default keeps a
long-lived session in IndexedDB, which would give the app two competing answers
to "who is signed in" that drift apart the moment a cookie expires or is
revoked. The client SDK proves an identity, hands over an ID token, and is then
signed out. One session, one authority.

**A Data Access Layer, not a proxy.** `src/server/auth/dal.ts` exports
`verifySession()` wrapped in React's `cache()`, and `requireSession()` which
redirects. Next's own guide is explicit that Proxy "should not be your only line
of defense" — it runs on prefetches, and a matcher edit can silently drop a
route out of coverage. There is no `proxy.ts` in this repo, so the DAL is not a
second layer behind one; it is the only layer, which is why it is the
authoritative check rather than an optimistic one.

**`verifySessionCookie(cookie, true)`** is the revocation-checking form. It
costs a round trip per render pass, which is what `cache()` is for.

### Why the nav fetches instead of the layout reading cookies

Every catalogue page in this app is statically prerendered. A top-level
`await cookies()` in `layout.tsx` would make all 114 of them dynamic — a whole
prerendered site traded for a nav label.

So the shell stays static, and the two client components that need the answer
ask `GET /api/auth/session` (`no-store`, returns a display name and nothing
else). That endpoint goes through the same DAL, so it reflects the session
cookie rather than the client SDK.

`/account` is the one route that is `force-dynamic`. That is stated explicitly
rather than inferred, and the reason is a trap worth knowing: `verifySession()`
returns `null` without reading cookies when no Admin credentials are present, so
a CI build that runs before runtime secrets exist would see a route with no
dynamic input, prerender it, and **bake in the redirect to sign-in permanently**.
The build output would look healthy.

---

## Saved order requests

`customers/{uid}/orderRequests/{autoId}` in Firestore.

**Why Firestore rather than Prisma.** `docs/backend.md` settles that Prisma owns
the catalogue and names the one exception worth revisiting: a genuinely
user-scoped slice. This is it — keyed by Firebase uid, not relational, joined to
nothing, and owned by an identity that already lives in Firebase. Putting it in
Postgres would mean mirroring Firebase uids into a second store for no gain. The
catalogue has not moved and must not.

**Ownership is a path segment, not a field.** A field can be spoofed on the write
that creates it; `customers/{uid}/…` compared against `request.auth.uid` cannot.
It also makes `list` inherently scoped — a query can only ever address one
customer's subcollection.

**Auto-generated document ids.** Firestore shards by key range, so
timestamp- or counter-prefixed ids put every new write on one shard. Its own
generated ids scatter.

### The trust boundary

The browser sends **ids and the customer's own words**, never a price, a product
name, a carrier or a total:

```ts
{ productId, quantity, fullName, phone, address, agentId, reference, requestedAt }
```

The server re-resolves the product, branch and brand from the catalogue,
re-derives the delivery route, re-runs the same validator the form ran, and
rebuilds the record with `createOrderRequest`. A hand-crafted request cannot
store a BMW at 5,000 TZS or attach a courier that does not serve the city. The
`uid` comes from the verified session and nowhere else.

`reference` is sanitised against the generator's alphabet (no 0/O/1/I/L/S/B/2)
and replaced if it does not match; `requestedAt` is rejected outside ±24h of the
server clock.

### The signed-out path is untouched

The form checks the session **client-side** before calling anything, so a
signed-out customer's name, phone number and address literally never leave the
device. That is enforced twice — the caller checks, and the action returns
`signed-out` without touching Firestore if called anyway — and asserted three
ways: a component test that the action is not called, a component test that a
still-loading session counts as signed-out, and an E2E test that watches every
request during a real signed-out order and asserts no same-origin POST and no
request body containing the customer's details.

---

## Security Rules

`firestore.rules`, deployed with `npm run rules:deploy`. Default deny; the only
open path is owner-read on a customer's own requests. **All writes are
server-only** via the Admin SDK, which bypasses rules by design — that is the
intended path, and it is why `customerId` can be trusted.

Tested with `@firebase/rules-unit-testing` against the real emulator:
`npm run test:rules` (emulator running) or `npm run test:rules:ci` (starts one).
13 assertions cover owner get/list, cross-customer get/list denial,
unauthenticated denial, all four client write verbs, and — the non-obvious one —
a **collection-group query**, which addresses every `orderRequests`
subcollection at once under a *different* match path and is denied only because
no `/{path=**}/orderRequests` rule was helpfully added.

The suite **fails loudly** if the emulator is unreachable rather than skipping,
because a security suite that silently skips still shows a green tick. It is
kept out of `npm test` (which would then fail on every machine without Java) and
has its own CI job with a pinned JDK.

**Both directions were verified by mutation**, not just by passing:

| Injected mistake | Result |
|---|---|
| `allow get/list: if request.auth != null` (the classic "authenticated ≠ authorized") | 2 tests fail |
| `allow create: if request.auth.uid == uid` (client may forge a request) | 1 test fails |

---

## App Check

`initAppCheck()` in `src/lib/firebase.ts`, mounted by
`FirebaseAppCheck.tsx` ahead of everything else that touches Firebase.
reCAPTCHA v3, keyed by `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`. With no key it
returns `null` and the site behaves exactly as before.

What it does and does not do, because this gets overstated: it proves a request
came from this app on a real browser. It says nothing about *authorization* —
Security Rules do that. And it covers **client-SDK traffic only**; every
server-side call here goes through the Admin SDK, which bypasses App Check and
Rules by design. So its real job in this app is the sign-in path: stopping a
script hammering Firebase Auth from outside a browser.

**Enforcement is an operator action and is deliberately not assumed.** Google's
guidance is monitor-only first, then enforce once the metrics show legitimate
traffic is not being scored out.

---

## Operator runbook

### Environment variables

Public, already in `.env.example`, safe in the client bundle:
`NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`,
`_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID` (optional).

**New, public:**

| Variable | Required? | What it is |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` | No | reCAPTCHA v3 site key. Absent → App Check off. |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` | No | Debug token for localhost/CI. **`.env.local` only** — one in the repo lets anyone mint valid App Check tokens. |

**New, genuinely secret. Set exactly one:**

| Variable | What it is |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | The *contents* of a service-account JSON key, one line. What a secret store can hold. |
| `GOOGLE_APPLICATION_CREDENTIALS` | A filesystem path to that file, **outside this repo**. Google's documented form. |

Optional: `FIREBASE_PROJECT_ID`, only if the server should act against a
different project from the public config.

On Cloud Run / App Engine / Cloud Functions neither is needed — the runtime
supplies Application Default Credentials.

> A Firebase **web API key is a public identifier**, not a secret; it ships to
> every visitor by design and Google documents it as safe to expose. A
> **service-account key is the opposite**: a private key granting full project
> access that bypasses both Security Rules and App Check. Never commit it, never
> give it a `NEXT_PUBLIC_` prefix, never paste it into a chat or an issue.

**With no Admin credentials set, the site works.** Sign-in reports itself
unavailable, and order requests behave exactly as they did before this feature.
That is a supported configuration and it is what was running during local
verification.

### Console steps, in order

1. **Authentication → Sign-in method → enable Google.** Already enabled on
   `v-mall-f37c6` (verified).
2. **Authentication → Settings → Authorized domains** — add the production
   domain. `localhost` is there by default.
3. **Project settings → Service accounts → Generate new private key.** Place it
   in the deployment's secret store as `FIREBASE_SERVICE_ACCOUNT_KEY`. It must
   not enter the repo.
4. **Firestore → create the database** in the project. Nothing else needs
   creating; the collections appear on first write.
5. **Deploy the rules**: `npm run rules:deploy`. Do this *before* the first
   write, and never edit rules in the console — a console edit is unreviewed,
   unversioned, and silently diverges from the tested file.
6. **App Check → register the web app** with reCAPTCHA v3, set
   `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, and leave enforcement **off**.
   Watch the metrics, then enforce Auth and Firestore.

### Admin access — granting and, more importantly, revoking

`/admin` is guarded by `isAdminUser()` in `src/server/auth/admin.ts`, which admits
two kinds of person: someone carrying the `admin: true` Firebase custom claim, or
someone whose verified email is listed in `SOKO_ADMIN_EMAILS`.

**The allowlist exists because nothing in the app can grant the first custom claim,
and nothing should be able to.** An application that can promote its own users to
admin is one bug away from letting a stranger do it. So the first admin is named in
config, outside the system they administer. Set it to the owner's Google address:

```
SOKO_ADMIN_EMAILS=owner@example.com
```

It is read per request, so adding or removing an address takes effect on the next
page load — which also makes it the fastest way to lock someone out in a hurry.

**Granting the claim** to anyone else, from a script or the console:

```ts
await getAdminAuth().setCustomUserClaims(uid, { admin: true });
```

They must **sign out and back in**. The claim travels inside the session cookie and
a cookie minted before the grant does not carry it.

**Revoking the claim is the part that surprises people, and it is a two-step
operation.** Clearing the claim alone does *not* end an existing session:

```ts
// NOT sufficient on its own — the current cookie still says admin: true.
await getAdminAuth().setCustomUserClaims(uid, { admin: false });
```

A session cookie lives **five days** and carries whatever the claims said when it
was minted. `verifySessionCookie(cookie, true)` does check for revocation, but
"revoked" means *issued before `tokensValidAfterTime`* — and only
`revokeRefreshTokens()` moves that timestamp. `setCustomUserClaims()` does not
touch it. So a demoted admin keeps working approve/reject access for the remainder
of their cookie's life.

Demote with both calls, the same pairing `destroySession()` already uses at
sign-out (`src/server/auth/session.ts:157`):

```ts
await getAdminAuth().setCustomUserClaims(uid, { admin: false });
await getAdminAuth().revokeRefreshTokens(uid);   // <- the one that ends the session
```

This is documented behaviour of the Admin SDK rather than something verified here —
no service-account key exists in this environment, which is the same gap the section
below records for the rest of the server half.

---

## Known gaps and things not verified

- **No end-to-end verification of the server half against real credentials.**
  No service-account key exists in this environment and it is not mine to
  create. Verified for real: client Google sign-in against `v-mall-f37c6` (the
  popup, the provider, the scopes, an ID token), the Server Action running, and
  the correct "sign-in isn't available on this deployment" degradation. **Not
  verified against a live project:** `createSessionCookie`,
  `verifySessionCookie`, the Firestore write, and `/account` rendering real
  saved requests. The Firestore paths *were* verified against the emulator via
  the rules suite. This is the largest untested seam.
- **A Firebase Auth user record was very likely created** for the owner's own
  Google account during that browser verification — `signInWithPopup` creates or
  looks up a Firebase user before any of our code runs. It is in
  Authentication → Users and can be deleted. Unintended; flagged rather than
  quietly left.
- **No rate limit on the save action.** There is a ceiling
  (`MAX_SAVED_REQUESTS_PER_CUSTOMER = 200`, checked with one aggregation read),
  which bounds total damage but not burst rate. Firestore's free tier is 20,000
  writes/day for the whole project. A signed-in customer can still burn writes
  faster than is reasonable. The honest fix is App Check enforcement plus a
  per-uid rate limit, and only the first of those is built.
- **Deleting a saved request is implemented** (2026-08-22). `deleteOrderRequest`
  in `src/app/actions/order-requests.ts` goes through the Admin SDK exactly as
  the write does, so `firestore.rules` keeps denying client deletes — the rules
  did not change and did not need to. The control is `DeleteSavedRequest`, an
  inline two-step confirm rather than `window.confirm()`, on each card in
  `/account`.

  Two things about it worth knowing rather than rediscovering. It is a **hard
  delete, not the soft delete debt #20 first proposed**: the "an order request
  is evidence" reasoning written into `firestore.rules` assumes a counterparty,
  and Soko has none — nothing is transmitted to the branch and nothing is
  charged, so a retained shell would settle no dispute and would just mean the
  deletion is not quite a deletion. And the id from the browser is **never
  trusted as a path** — `collection.doc("a/b/c")` is legal Firestore and
  addresses a nested document, so `isValidRequestId` requires a 20-character
  auto id before anything touches the network. That is the case with a test on
  it.
- **PII lives in Firestore**: name, phone number and delivery address per saved
  request. That is the point of the feature, but it is the first place Soko
  stores customer PII at rest. A customer can now remove a request themselves,
  which covers the data-rights half. **What is still unmade is the retention
  decision**: how long an untouched saved request should live before it expires
  on its own, and whether closing an account should purge the subcollection.
  Both are the owner's calls, not an engineer's — a number invented here would
  read as policy to whoever found it next. The mechanism to enforce whatever is
  chosen (a TTL policy on the collection, or a scheduled purge) is not built.
- **A console error appears during sign-in and is not ours.**
  "Cross-Origin-Opener-Policy policy would block the window.closed call",
  repeated while Firebase polls for a closed popup. `accounts.google.com` sends
  `COOP: same-origin` itself, which severs the opener from Google's side; no
  header we set can override a header on their document. Setting
  `same-origin-allow-popups` on `/sign-in` was tried and does **not** silence it.
  That header is kept anyway, for opener isolation on the one page that opens a
  window. Cancellation is still detected and reported. Relevant to debt #19 if
  `collectConsoleErrors` is ever pointed at `/sign-in`.
- **Phone auth was not built**, so none of its console configuration (SMS region
  allowlist, Blaze billing) has been touched.
