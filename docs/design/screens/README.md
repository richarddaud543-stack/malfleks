# Home page — the night redesign, as captured

Reference captures of `/` after the 2026-08-27 redesign. Taken from a **real
production build** (`next build` + `next start`) driven in Chromium, not from a
dev server and not mocked up — what is in these frames is what the page does.

| Set | What it is |
|---|---|
| `home-desktop-01..06` | 1440×900, successive scroll depths through the five scenes: overture → the rule → the catalogue rail → cities → close |
| `home-mobile-01..04` | 390×844, the same sequence on a phone |
| `home-reduced-motion-01..03` | 1440×900 with `prefers-reduced-motion: reduce` |

The reduced-motion set is the one worth checking against the others. Nothing is
missing from it and nothing is mid-animation: no timeline is built, no
ScrollTrigger is created, the ambient glows are gone and the generative field is
composited back to 0.28. That is the accessibility contract working, and it is
the set to re-shoot first if the scenes ever change.

Downscaled to 1x and saved as JPEG deliberately — the originals were 2x/3x DPR
PNGs totalling 26 MB, and this repository still has no remote (debt #2), so
anything committed now is carried forever. 0.76 MB for the set.

Re-shoot with a production build, never `next dev` — dev compiles per request
and the first paint is not representative.
