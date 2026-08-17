# Image & data provenance

## Brand logos (`public/images/brands/`)

Real logos downloaded from Wikimedia Commons via the stable `Special:FilePath` redirect. Verify current licensing on each file page before commercial launch.

| Brand | File | Source |
|---|---|---|
| Toyota | `toyota.svg` | https://commons.wikimedia.org/wiki/File:Toyota_Logo.svg |
| Ford | `ford.svg` | https://commons.wikimedia.org/wiki/File:Ford_logo.svg |
| BMW | `bmw.svg` | https://commons.wikimedia.org/wiki/File:BMW.svg |
| Oraimo | `oraimo.png` | https://commons.wikimedia.org/wiki/File:Oraimo_Logo.png |
| Apple | `apple.svg` | https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg |
| Halotel | `halotel.png` | https://commons.wikimedia.org/wiki/File:Logo_new_Halotel.png |

**Before going live**: these are trademarked logos used here for product identification (nominative fair use), not implying endorsement or an official partnership. Confirm actual distribution/reseller agreements with each brand before launching commercially, and swap in each brand's official press-kit asset if available.

## Product images

Sample product images are NOT photographs — they're custom flat-icon illustrations rendered per product category (`src/components/product/ProductIcon.tsx`), tinted with each brand's accent color. This was a deliberate substitution for real "generic stock" photography: Wikimedia Commons searches for generic product categories (routers, earbuds, sedans) kept surfacing either vintage/irrelevant results or photos with visible third-party competitor branding (Netgear, TP-Link, Samsung, etc.), which would have looked like an error inside a specific brand's catalog. Custom icons keep every brand on equal footing and stay visually consistent inside the 3D showcase.

**Before going live**: replace with real licensed/official product photography per brand.

## Branch & delivery-agent data

`src/data/branches.ts` and `src/data/delivery-agents.ts` carry a `verified: boolean` field:
- `verified: true` — grounded in real research (confirmed distributor/branch/courier in Tanzania at time of writing, August 2026).
- `verified: false` — illustrative placeholder (plausible city/address, not independently confirmed) used to fill out the catalog for prototype purposes.

Confirm and replace all `verified: false` entries with real addresses/contacts before this goes live.

### Courier ETAs (`DeliveryAgent.eta`)

On 2026-08-17 the prose `etaEstimate` field ("Same-day", "1 day", "1–2 days") was replaced by a structured `eta: { minDays, maxDays }` so couriers could be ranked. Every value is a **faithful translation of the string it replaced** — `Same-day` → 0–0, `1 day` → 1–1, `1–2 days` → 1–2 — so no record's `verified` flag changed: the same claim is simply now comparable. The customer-facing label is derived by `formatEta()` and never stored.

Brand-fleet branches publish **no** delivery time at all. Nothing in `branches.ts` carries one, so the UI shows none rather than a plausible-looking guess — see `previewDelivery()` in `src/lib/order.ts`. **Before going live**: get real committed delivery windows from each brand that runs its own fleet, and confirm the courier quotes above with the couriers themselves.

## Branch coordinates (`Branch.coords`)

Every branch carries a `coords` pair used only to place it on the `/locator` map. These are **approximate city-centre coordinates, not surveyed shopfront positions** — all branches in a city share one coordinate, defined once as `cityCoords` at the top of `src/data/branches.ts`:

| City | Approx. lat, lng |
|---|---|
| Dar es Salaam | -6.7924, 39.2083 |
| Arusha | -3.3869, 36.6830 |
| Mwanza | -2.5164, 32.9175 |
| Dodoma | -6.1630, 35.7516 |

They are commonly published city centroids, rounded to four decimal places, and they deliberately **do not** change any record's `verified` flag: knowing which city a branch is in is not the same as having confirmed its address. A branch with `verified: false` stays `false` even though it now has a coordinate.

**Before going live**: geocode each branch's real street address so the map points at the actual shopfront rather than the middle of town.

## Locator map outline

The Tanzania outline on `/locator` is hand-authored in `src/components/locator/geo.ts` as a short list of lat/lng vertices, smoothed into a rounded shape at render time. It is a stylised sketch, not cartographic data, and is not derived from any licensed dataset. No map service, tile provider or API key is involved, so the page works fully offline.
