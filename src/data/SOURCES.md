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
