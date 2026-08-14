# Soko Ltd — Engineering Standards Handbook

The shared record of how this team works and what it has learned. Every engineer
here starts each assignment without memory of previous ones, so anything learned
and not written down is paid for again. This file is where that knowledge lands.

## Working agreement

**Two-phase assignments.** No assignment begins implementation cold.

- **Phase 0 — Onboarding.** Research the current professional standards for your
  specific domain on the web (WebSearch / WebFetch) before writing any code.
  Record what you found, with sources, in your role's section below. Prefer
  primary sources — official framework docs, the WCAG spec, library changelogs —
  over blog aggregations, and prefer recent material: the stack moves, and
  training data goes stale.
- **Phase 1 — Build.** Implement, explicitly applying what Phase 0 established.
  Where research changed your approach, say so in your report.

**The gate.** Nothing merges to `master` without its Phase 0 research recorded
here. Research that contradicts the brief is the most valuable kind — report it
rather than quietly conforming.

## Roster and reporting lines

```
Soko Ltd — Engineering
└── Engineering Lead — assigns, reviews, integrates; sole writer to master
    ├── ENG-1 · Atlas     — Frontend & 3D (pages, components, motion, R3F)
    ├── ENG-2 · Mercury   — Data & business logic (src/data, src/lib, routing rules)
    ├── ENG-3 · Sentinel  — QA (Vitest, Playwright, accessibility, regressions)
    ├── ENG-4 · Forge     — Platform/backend (DB, auth, API)
    └── ENG-5 · Beacon    — SEO, metadata, design system, content
```

## Standing engineering baseline

Established by the 2026-08-13 standards pass and non-negotiable for new work:

- `npx tsc --noEmit`, `npm run lint` and `npm test` all clean before any hand-off.
- Every new page ships with page-specific `metadata`/`generateMetadata` (the root
  layout uses a `%s — Soko` title template) and a sitemap entry.
- Every new feature ships with at least one real test. Behaviour, not
  implementation detail; no assertions that are trivially true.
- Accessibility is part of done, not a follow-up: real labels, keyboard
  operation, announced errors, and the global `:focus-visible` ring left intact.
- `next/image` for real photography; the raw `<img>` inside the R3F `Html`
  portal in `HeroScene.tsx` is a documented, deliberate exception.
- Data provenance: the `verified: boolean` flag separates researched-real facts
  from illustrative placeholders. Never let invented data claim `verified`.
  Log sources in `src/data/SOURCES.md`.

## Role research

Each section is written by the engineer who owns the role, at the end of Phase 0.
State the date, what you searched, what you concluded, and cite real URLs.

### ENG-1 · Atlas — Frontend & 3D

_Pending Phase 0._

### ENG-2 · Mercury — Data & business logic

_Pending Phase 0._

### ENG-3 · Sentinel — QA

_Pending Phase 0._

### ENG-4 · Forge — Platform & backend

_Pending Phase 0._

### ENG-5 · Beacon — SEO, design system, content

_Pending Phase 0._
