---
name: relay-release
description: ENG-9 Relay — git hygiene, line endings, CI and the Vercel deploy path on MalFleks. Load before touching .gitattributes, a workflow, the deployment gate, or anything about the state of `master` relative to `origin`.
---

# ENG-9 · Relay — Release & repository

You own the repository as an artefact and the path from a commit to a customer. You
report to the Engineering Lead, who is the only writer to `master`.

**Read first:** `docs/engineering-standards.md` — debt rows 1, 2 and 11 are yours.

## The stack as it stands

Next.js on Vercel, `vercel.json` in the repo, GitHub remote at
`richarddaud543-stack/malfleks`, default branch `master`. CI is two jobs and there is no
third: `static` (types, lint, unit against a real Postgres service) and `e2e` (Playwright
against a production build).

## What I have learned, and paid for

**`git ls-files --eol` is the diagnostic, not `git status`.** When the whole tree reports
as modified, that command says whether the problem is real. Here it printed
`i/lf  w/crlf  attr/` — LF in the index, CRLF on disk, no attribute reconciling them —
across 356 text files. 354 files showed as modified; **only 11 had real changes.** The
other 343 were byte-identical text with different line terminators.

**History was never damaged, only the working tree.** Every text blob in the repo was
already LF (`git ls-files --eol`: 356 `i/lf`, 16 binary, 5 empty). That is what made the
fix cheap: `.gitattributes` with `* text=auto eol=lf` works at the *compare* step, so the
phantom diff vanished without rewriting a single file on disk. **No `git add --renormalize`
was needed and running one would have been wrong** — it stages the working tree, which
would have swept eleven files of unfinished feature work into a whitespace commit.
Diagnose which side drifted before reaching for renormalize.

**GitHub's own guidance stops short of what this repo needs.** Its recommendation is
`* text=auto`; it reserves `eol=lf` for "files that must keep LF endings, even on Windows"
rather than applying it everywhere. Pinning `eol=lf` repo-wide, as here, is deliberately
stricter: it also fixes the working-tree ending on the next checkout of each file, so the
drift cannot recur on a Windows clone. The cost is that Windows-only tooling expecting
CRLF will not get it. Accepted, because the drift already cost more.
Source: <https://docs.github.com/en/get-started/git-basics/configuring-git-to-handle-line-endings>

**Git's own background maintenance leaves locks behind and blocks every write.** Every
`git` command here failed with `Unable to create '.git/index.lock': File exists` until
`.git/HEAD.lock` and `.git/objects/maintenance.lock` were cleared — both stamped by a
maintenance run, not by a crashed command. If a lock reappears immediately after deletion,
look for `maintenance.lock` before blaming a hung process. Deleting a stale lock is safe;
deleting one while a real git process runs is not, so check the timestamp first.

**A shell that cannot delete cannot run git.** Git needs to unlink its own temp objects
and locks. In a sandbox without delete permission every write succeeds but emits
`warning: unable to unlink .git/objects/xx/tmp_obj_*`, leaving litter that `git gc`
later clears. Get delete permission before a session of git work rather than during it.

**The suite is not portable across OS boundaries.** `npx vitest` dies at startup with
"Cannot find native binding" when run from Linux against a `node_modules` installed on
Windows — rolldown ships platform-native binaries. `npx tsc --noEmit` and `npx eslint`
are pure JS and run anywhere. Typecheck is portable evidence; the test suite is not.

**Pushing needs credentials that live on the machine, not in the repo.** GitHub is
reachable but the remote is HTTPS with no credential helper configured
(`git config --get credential.helper` is empty), so a non-interactive shell fails with
`could not read Username for 'https://github.com'`. On Windows the credential lives in
Credential Manager, which only a Windows process can read. Fix once with
`git config --global credential.helper manager` and a single interactive push, or the
same wall appears every time.

**Vercel can gate production on CI, and that is the shape debt #2 should close into.**
Deployment Checks hold a production build off the production domain until required checks
pass — GitHub Actions results import directly as checks. This decouples build from
release: merging creates the deployment, passing checks releases it, and `Force Promote`
is the deliberate override. It matters here because the set of code tested *before* a
merge is not the set released after one. Two edge cases from the docs: GitHub identifies
checks by **job name**, so renaming a job silently breaks the gate, and reusing a job name
across workflows creates race conditions with branch protection.
Source: <https://vercel.com/docs/deployment-checks> (docs updated 2026-08-11)
