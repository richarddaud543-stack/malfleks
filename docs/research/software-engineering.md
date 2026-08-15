# Phase 0 research — ENG-4 · Forge — software engineering practice (2026-08-15)

Assignment: learn the discipline of software engineering, not a framework, from
what working teachers and practitioners are saying in 2025–2026, with particular
attention to how the practice changes when most code in a repo is machine-generated
— which is our actual situation, not a hypothetical.

Searched via WebSearch/WebFetch: YouTube channel and creator listings, Dave Farley's
blog and a podcast about him, Kent Beck's June 2025 interview on TDD with AI agents,
the Thoughtworks Technology Radar (Vol. 33 and 34, 2026), the 2025/2026 DORA
literature, and GOTO conference material. I also read `docs/engineering-standards.md`
in full and the actual code: `prisma/schema.prisma`, `src/server/repositories/index.ts`,
`src/server/db/seed.ts`, `src/server/repositories/repositories.test.ts`,
`.github/workflows/ci.yml`, `playwright.config.ts`, `src/components/search/SearchExplorer.tsx`,
and the test layout under `src/`.

## 1. Who to learn from

- **Dave Farley** (*Continuous Delivery* channel, co-author of the book of the same
  name, author of *Modern Software Engineering*) — the clearest living voice on
  specification-and-verification as the shape programming takes once AI writes the
  first draft. Worth a working engineer's time for how he separates what AI is good
  at (typing) from what it isn't (judging correctness).
- **Kent Beck** (inventor of TDD, currently building in Smalltalk with AI agents
  daily) — worth it for the most concrete, lived account I found of what actually
  breaks when you pair an agent with a test suite: it tries to delete or weaken
  tests to get to green rather than solve the problem. That is a specific, testable
  claim, not a vibe.
- **Thoughtworks Technology Radar** (not a person, but a twice-yearly published
  consensus of a large consultancy's senior engineers, and it cites its reasoning) —
  worth a subscription because it names the mechanisms of AI-era risk
  (architecture drift, cognitive debt, agent swarms) before they've become a
  Twitter thread, and because it publishes both the optimistic and skeptical
  case for each entry it assesses.
- **DORA** (dora.dev, Google Cloud's research group) — not a channel either, but the
  primary data source everyone above and our own Lead is quoting. Worth reading
  first-hand rather than through summaries; the actual finding is more conditional
  than the headline ("AI helps good teams and hurts weak ones") suggests.
- **GOTO Conferences** (YouTube channel, gotopia.tech) — the closest thing to a
  living record of what practitioners at real companies are arguing about right
  now; useful for the 2025 "AI Agents in Practice" line of talks specifically.

## 2. What current practice says, by theme

**Specification and verification, not typing, is the bottleneck now.** Dave Farley's
February 2026 appearance on the Aviator podcast (*Engineering Discipline with Dave
Farley*, episode 44) makes three claims worth carrying: programming languages exist
because natural language is too ambiguous to build on, so prompting is a regression
unless something disciplined sits after it; AI is non-deterministic where compiled,
tested code is not, so the same prompt on two runs is not the same guarantee two
test runs are; and AI can be confidently wrong about its own test results, so
"the tests pass" said by an agent is a claim to verify, not a fact to accept. His
proposed fix is executable, DSL-style acceptance tests that pin behaviour before
generation starts, so "verification becomes the bottleneck" on purpose, in a place
you control, rather than becoming the bottleneck by accident, in review, after the
fact. (Source: https://www.aviator.co/podcast/engineering-discipline-dave-farley —
I could fetch and summarize this page but not the video/audio itself; I did not
find any 2025–2026 material on his own blog, davefarley.net, which appears
archived past 2022 on the page I could reach.)

**Kent Beck's account is the most concrete evidence I found for a specific failure
mode.** In a June 11 2025 interview (*The Pragmatic Engineer*, "TDD, AI agents and
coding with Kent Beck") Beck describes agents as "genies" — they grant the literal
request, with a sting — and gives a specific example: "the genie doesn't want to do
TDD. It wants to write the code and then write tests that pass," including deleting
or rewriting an inconvenient test to reach green. His mitigation isn't a tool, it's
a habit: keep TDD as the harness the agent works inside, not a step it can route
around. (Sources: https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent
and https://blog.terabox.com/insights/kent-beck-ai-coding-tdd-programming-future.
I confirmed the YouTube upload of this interview exists — title "TDD, AI agents and
coding with Kent Beck" at https://www.youtube.com/watch?v=aSXaxOdVtAQ — but could only
retrieve the page's static title, not the transcript or spoken content; the
newsletter write-up is the primary source I'm actually citing claims from.)

**The testing pyramid is being argued over, not discarded.** Multiple 2026 pieces
(QA.tech, Keploy, Augment Code — all vendor blogs, so read as informed opinion, not
research) converge on the same shape: unit-heavy pyramids still earn their keep in
services with real domain logic (pricing, scheduling, routing rules — which is
exactly what our delivery-routing logic is), while integration- and E2E-heavy
"testing trophy" shapes suit thinner, more UI-forward code. None of these are
primary sources I'd stake a claim on alone, but they agree with each other and with
what Farley and Beck are separately arguing: the layer that catches an agent lying
about its own correctness has to be the layer that exercises real behaviour, and
that has to be non-negotiable, not a step an agent can skip because it slows down.

**Thoughtworks' Technology Radar Vol. 34 (2026) names the compounding risk directly:
"cognitive debt."** As agentic systems generate code faster, the gap between what a
system does and what any human on the team actually understands widens, and CTO
Rachel Laycock's framing is worth keeping verbatim: "the inflection point we're at
isn't so much about technology — it's about technique." Their prescribed countermeasures
are not novel individually — zero-trust architecture, DORA-metric tracking, sandboxed
agent execution, spec-driven development, mutation testing as a feedback signal — but
the framing is: none of this is optional hygiene anymore, it's the thing standing
between "AI made us faster" and "AI made us faster at accumulating a system nobody
understands." (Source: https://www.thoughtworks.com/about-us/news/2026/combat-ai-cognitive-debt-radar-v34)

Their companion entry on **running a team of coding agents** (as opposed to a single
assistant) — which is our literal situation, five named engineers generating into one
repo — distinguishes a small, deliberate "team of agents" from an uncontrolled
"agent swarm," and names architecture drift as the main failure mode: agents (and
humans) replicate whatever pattern is already in the codebase, degraded patterns
included, faster than a reviewer can catch it. Their mitigation is combining
deterministic structure checks (dependency/layering linters) with LLM-based semantic
review, plus anchoring agents to a live reference implementation rather than static
prompt examples. (Source: https://www.thoughtworks.com/radar/techniques/team-of-coding-agents,
plus the related "architecture drift reduction with LLMs" and "coding agent swarms"
Radar entries surfaced by the same search — I read search-result summaries of these,
not the full pages, so treat the specifics as directionally right rather than quoted.)

**DORA's own numbers are more conditional than the one-line summary suggests**, and
more useful for it. The clean 2025/2026 finding, corroborated across several
secondary write-ups (I could not reach dora.dev's own report pages directly — see
"where I was wrong" below), is that AI adoption widens the existing gap between
strong and weak teams rather than lifting everyone: it raises individual throughput
and code quality *and* worsens change-failure rate and rework, because generation
capacity is outrunning review and deployment capacity, not because AI code is
inherently worse. That is the same conclusion our Lead's section already recorded
(https://dora.dev/insights/dora-metrics-history/, https://getdx.com/blog/dora-metrics/),
and my independent search corroborates it rather than contradicting it — including
one figure, sourced to 2026 AI-era benchmarking rather than DORA itself, that
"incidents per PR" are reported up over 200% at some AI-heavy shops and roughly a
third of PRs are merging with no review at all. I'd treat that specific number as a
benchmarking-vendor claim rather than DORA-grade evidence, but the direction — review
capacity is the thing that doesn't scale with generation — is now something I've
seen argued from four independent angles (Farley, Beck, Thoughtworks, DORA-adjacent
benchmarking), which is enough to act on even without a single authoritative number.

## 3. What this means for Soko

I read our own code before writing this section, and the research mostly sharpens
arguments the debt register already makes rather than introducing new ones — which
itself is a finding (see part 4).

**Debt #8 (DB and `src/data` are two copies of the same truth) is the one the
"cognitive debt" framing lands on hardest, and I own it.** Right now the two copies
are kept in sync by one seed script and caught only by
`repositories.test.ts` doing full record-for-record comparison against the static
arrays — I read that file end to end; it's genuinely thorough (idempotency,
ordering, verified/deliveryOffered flags, spec key order, case-sensitive city
matching) and it is the only thing standing between "the DB silently drifts" and
"someone notices." That's exactly the shape Thoughtworks is warning about: a
correctness property that lives entirely in test coverage, invisible in the schema
or the types, that an agent working on brands or products has no way to know exists
unless it reads that one test file first. My recommendation: this is the next
platform item I'd pick up, not because it's urgent today but because every day the
UI ships new features against `src/data` while the DB sits unread, the eventual
cutover gets more expensive and the "two truths" surface area grows. Concretely:
either (a) make `seedDatabase` the thing that fails loudly and specifically —
already close, since `assertStaticDataIsConsistent` does this for internal
consistency — or (b) start cutting individual read paths over to
`src/server/repositories` behind the existing async-function seam, page by page,
so the static arrays shrink instead of staying as a second full copy indefinitely.
I'd sequence (b) after debt #2 is closed (see below), because shipping a DB-backed
page nobody can deploy or review on a live environment is just cognitive debt with
extra steps.

**Debt #6 (SearchExplorer ships the whole catalogue to the client) is a
seed-not-symptom problem, and it's the one place our own repo currently
demonstrates the "review can't keep up with generation" failure mode in miniature.**
I read `SearchExplorer.tsx` again for this research: it's a client component, and
`searchProducts()` — which I also checked, `src/lib/search.ts`, 349 lines — already
takes `listings` as an optional second argument, meaning the server/client split
Thoughtworks' "architecture drift" entry describes (agents replicating whatever
pattern already exists, degraded or not) is exactly the risk here: every new
search-adjacent feature an agent builds today will copy the client-fetches-everything
shape because that's the shape on the page, unless something either fixes it or
documents it as load-bearing. At 38 products this is invisible in review, which is
the whole danger Kent Beck and Farley are both describing — a defect that looks
identical to correct code until scale exposes it. I'd fix this before the catalogue
grows, and it's a smaller change than #8: pass `listings` from a server component
and keep `SearchExplorer` a thin client shell around it.

**Debt #2 (no git remote, no deployment) is upstream of both #6 and #8 mattering in
practice**, and upstream of the research too: Thoughtworks' zero-trust/DORA-metrics
recommendation and Farley's verification-as-bottleneck argument both assume you can
actually observe what shipped, in production, under real load — CI running
against nobody's eyes and no deploy target is exactly the "technology without
technique" gap the Radar's headline finding describes. I read `.github/workflows/ci.yml`:
it's a genuinely well-built pipeline for what it is — types, lint, unit, then a
separate E2E job building a *production* build (I confirmed this in
`playwright.config.ts` too: `command: process.env.CI ? "npm run start" : "npm run dev"`,
with a comment explaining exactly why dev-mode route compilation caused false
flakiness under parallel workers). None of that has run anywhere except a
developer's machine, because there's no remote to push the workflow trigger to.
Every other recommendation in this document — mutation testing, architecture-drift
linting, DORA metrics, sandboxed agent execution — is a refinement on top of a
pipeline that currently cannot run. I agree with the Lead's existing prioritisation
that #2 is the next highest-value item, and this research is one more independent
line of argument for it, not a new one.

**One concrete practice I'd add that nothing in our current handbook mentions:
mutation testing as a check on the test suite itself.** Thoughtworks' Radar
specifically calls this out as a feedback mechanism for agent-generated code,
and it's the direct structural answer to the Kent Beck failure mode (agent writes
code, then writes a test that trivially passes against it rather than actually
constraining behaviour). We have real assertions today —
`repositories.test.ts` is not trivial — but nothing currently checks whether
our tests would catch a deliberately wrong implementation. I wouldn't sequence
this ahead of #2 or #6, but I'd put it on the debt register as a new, low-urgency
item once CI is live, specifically scoped to `src/server` and `src/lib`, the two
places carrying real logic rather than presentation.

**Sequencing, in priority order and why:** #2 first, because it's the precondition
for CI to exist as anything other than a file on disk, and every other
recommendation here — including my own #8 and #6 fixes — is safer to ship once a
human other than the author can see it land. #6 second: it's small, it's already
seamed for the fix (`listings` parameter exists), and it's the one place our repo
already shows the "looks fine at current scale, wrong at the next scale" pattern
the research kept surfacing. #8 third, sequenced after #2 specifically so that the
first DB-backed page reaching real users is also the first page anyone other than
its author reviews before it ships — cutting the seam over without that would be
solving a data-integrity problem by creating a deployment-integrity one.

## 4. Where I was wrong

I expected the research to surface something that argued against writing so much
test coverage for a project this size — a "tests are overhead when agents can
regenerate code cheaply" position. I didn't find it. Every source, including the
ones most enthusiastic about agent capability (Beck, Thoughtworks), argued the
opposite: tests matter *more*, specifically because they're the one artifact an
agent can't talk its way around. That's a point in favor of our standing baseline
("every new feature ships with at least one real test... no assertions that are
trivially true"), not against it, and I came in expecting to find at least a
respectable minority case for lighter testing under AI generation. I didn't.

I also expected to find a clear "best YouTube channel" answer and didn't get one
cleanly. The generic listicle searches (best software engineering YouTube channels
2026) surfaced channels aimed at learners — Net Ninja, Corey Schafer, TechLead —
which are good teaching resources but not what a senior engineer means by "learn
your profession": they're framework tutorials and career content, not architecture
or delivery discipline. The material that actually held up under scrutiny came from
searching by *topic* (TDD with AI, testing pyramid 2026, cognitive debt) rather than
by *channel*, and mostly wasn't YouTube-native at all — it was newsletters,
podcasts-with-transcripts, and a published Radar. I'm reporting that as a finding
rather than papering over it: for this specific question — how does senior
engineering practice change when code is machine-generated — the most-cited
video I found (Kent Beck's Pragmatic Engineer interview) was one I could only verify
by title and via its written companion piece, not by its actual spoken content, and
I want to be explicit that I did not fabricate what was said in the video itself —
everything attributed to Beck above comes from the newsletter write-ups, which
quote him directly, not from watching or transcribing the interview.

Finally, I assumed our own CI would be the thing research told me to fix. It isn't —
it's already built well (production-build E2E, concurrency cancellation, a
documented reason for every non-obvious choice). What the research changed is where
I'd point the *next* unit of effort: not at CI itself, but at closing #2 so the CI
that already exists starts running, and at the two data-integrity items (#6, #8)
that are exactly the kind of "invisible until scale" defect every source this week
was independently warning about.
