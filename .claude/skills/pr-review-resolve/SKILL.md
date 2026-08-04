---
name: pr-review-resolve
version: 1.0
description: "End-to-end review of a GitHub pull request: fetch the diff and any existing review comments (bot or human), independently verify every claim — yours and theirs — rather than trusting them, present findings and let the user pick which fixes to apply, implement approved fixes with regression tests, verify the full test suite, commit via GitButler to the PR's own branch, push, and reply-and-resolve each addressed review thread via the GitHub GraphQL API. Keywords: PR review, code review, GitHub pull request, resolve review comments, Copilot review, verify reviewer claims, regression test, GitButler commit."
argument-hint: "<PR number or branch name>"
---

# PR Review & Resolve Workflow

Reviews a GitHub PR from scratch, cross-checks it against whatever automated or human
review comments already exist, and — only after the user signs off — fixes what's real,
proves the fixes with tests, and closes the loop on the PR itself (commit, push, reply,
resolve).

The distinguishing discipline of this workflow is **verify before you assert**. A finding
is not "confirmed" because it sounds plausible or because a reviewer (bot or human) stated
it with confidence — including this workflow's own findings. If a claim is checkable
(browser/DOM behavior, a library's API contract, whether an exception actually propagates),
check it before presenting it as fact. Reviewers, including automated ones, are sometimes
wrong — accepting a wrong "fix" is worse than finding nothing.

## Phase A — Gather PR context

```
gh pr view <target> --json title,body,author,baseRefName,headRefName,state,additions,deletions,changedFiles,labels,number
gh pr diff <target>
```

`<target>` is a PR number or head branch name. The PR's diff is the review scope — not
local working-tree changes.

**If the local checkout doesn't match the PR's head branch** (e.g. a GitButler workspace
that applies several stacked branches at once, so files on disk reflect more than one PR),
do not read "surrounding code" from the working tree — it may contain unrelated changes
from other stacked branches. Fetch the exact PR-branch version instead:

```
git show <head-branch>:<path/to/file>
```

Confirm the checkout state first (`git branch -a`, or notice whether the base branch in
the PR metadata differs from what a naive local diff would show) before deciding which
source of truth to read from.

## Phase B — Independent review

Read the diff plus enough real context (not just the hunks) to judge correctness, not
just style. Produce the standard shape: overview, code quality/style, specific
correctness/risk findings, test coverage assessment.

Two habits that catch what a surface read misses:

- **Trace state/timing issues concretely.** For a suspected race or stale-closure bug,
  don't describe it abstractly — walk an actual timeline with concrete object values
  (`A = {...}` at `T0`, then what a concurrent action produces at `T1`, then what the
  original code does with both at `T2`). If you can't build a concrete timeline that
  reaches a wrong outcome, the "bug" may not be real.
- **Check for risk handled inconsistently within the same PR.** If one component/function
  guards untrusted or legacy data before using it (e.g. validates a value before building
  a style string or a query) and a sibling component doesn't, that inconsistency against
  the PR's *own* established pattern is a strong, low-noise signal — the PR author already
  decided this class of input needs guarding; the gap is very likely an oversight, not a
  deliberate scope decision. Confirm which by checking whether the PR's own tests/docs
  describe the guarded behavior as intentional.

**Verify empirically when a claim is about runtime behavior, not app logic** — browser API
behavior (does an unescaped character in a CSS selector actually throw? does a disabled
submit button actually block Enter-key form submission?), a third-party library's
contract (is a plugin's `enable*()` method idempotent, or does calling it twice
double-register a handler?), etc. Don't reason from memory alone for anything you can
cheaply test:

- For DOM/browser behavior: write a minimal repro HTML file plus a short Node script that
  drives it with the project's already-installed Playwright (`@playwright/test`'s
  `chromium.launch()`), navigate to the file with `file://`, and assert on the outcome.
  Put scratch files in the scratchpad directory, or if they must run from inside the repo
  for module resolution, create them with a distinctive prefix (e.g. `__scratch_*`) and
  delete them immediately after use — confirm with `git status --short` that nothing
  scratch survives before committing.
- For a library's behavior, read its shipped `.d.ts`/source in `node_modules` directly
  rather than assuming from the public docs, which can lag the installed version.
- If a fix's premise is "X currently causes Y," prove it by reverting the fix, running the
  relevant test, and confirming it fails *for the stated reason* (not some unrelated
  error) — then restore the fix and confirm it passes. This is the same discipline as
  empirical DOM verification, applied to your own proposed fix instead of a claim about
  browser behavior.

## Phase C — Pull existing review comments

```
gh pr view <target> --json comments,reviews
gh api repos/{owner}/{repo}/pulls/<number>/comments
```

The first call surfaces review-level summaries (from bots like
`copilot-pull-request-reviewer` or human reviewers); the second surfaces inline/threaded
comments with `path`, `line`, `diff_hunk`, and `body`. `{owner}/{repo}` is resolved
automatically by `gh` from the current repo — no need to look it up separately. Note
whether comments are top-level review comments or a "suppressed comments" block folded
inside a review body (some bots generate but don't post low-confidence comments; still
worth reading and briefly assessing, not just skipping).

## Phase D — Verify every existing comment independently

For each comment, don't take the claim at face value — check it the same way Phase B
checks your own findings:

- Does the claim's premise hold given the actual code (not the diff hunk in isolation —
  the surrounding function, the calling context, other guards already in place)?
- If it's a claim about runtime/browser/library behavior, verify it the same way as
  Phase B (a minimal repro beats trusting the wording). A claim can be confidently wrong —
  e.g. "pressing Enter in a text input submits the form even if the only submit button is
  disabled" is a common but incorrect claim about HTML's implicit-submission spec; a
  10-line Playwright repro settles it either way.
- If a claim doesn't hold up, don't apply it, and say so plainly (with the evidence) when
  presenting findings — don't just quietly omit it.

## Phase E — Present everything, then ask

Present your own findings and the external review's findings together in one pass,
cross-referenced: note where they overlap (independent convergence is a strong signal),
where only one side caught something, and where an external claim didn't survive
verification (state why). For each proposed fix, give a one-line risk/confidence
assessment.

Then use `AskUserQuestion` (`multiSelect: true`) listing each independent fix as its own
option, so the user picks exactly which to apply. **Do not edit any code before this
step** — a review is not an invitation to act on it unilaterally, and low-value/stylistic
findings may not be worth the change even when technically correct.

## Phase F — Apply approved fixes

- Keep each fix minimal and surgical; match the file's/codebase's existing patterns (e.g.
  if a sibling component already has a helper for exactly this guard, reuse it rather than
  inventing a new approach).
- For any fix addressing a confirmed *bug* (not a style/type nitpick), add a regression
  test when feasible, in the style of the existing test suite. Prove it's meaningful per
  Phase B's empirical-verification habit: temporarily revert just the fix, run the new
  test and confirm it fails for the expected reason, then restore the fix and confirm it
  passes. Don't skip the revert-and-confirm step — a regression test that was never
  observed to fail is unproven.

## Phase G — Verify

Run the project's full verification surface on the changed files/suite, not just the one
new test — a fix in a shared component (e.g. a hook used by many callers) can regress
something the new test doesn't cover:

- Typecheck (`tsc --noEmit` or equivalent)
- Lint the changed files
- Unit/integration suite
- E2E suite — at minimum the affected specs; the full suite for a small/medium PR

Delete any test-run artifacts (trace dirs, `test-results/`, etc.) created during
verification before committing, and confirm with `git status --short` that only the
intended source/test files are dirty.

## Phase H — Commit (GitButler)

```
but diff
but commit <branch> -m "<message>" --changes <id>,<id>,...
```

Commit directly to the PR's own existing branch (never a new branch, never `main`) unless
the user has asked otherwise. `<branch>` is the PR's `headRefName` from Phase A. Write the
commit message around *why* — reference the concrete failure mode confirmed in Phase B/D
(what input/timing causes what wrong behavior), not just a description of the diff.

If this repo isn't using GitButler, use plain `git add`/`git commit` on the PR's checked-out
branch instead.

## Phase I — Push and resolve

```
but push <branch>
```

For each comment thread addressed in Phase F, reply referencing the fix commit, then
resolve the thread. GitHub's REST API can't resolve a review thread — this requires
GraphQL:

```
gh api repos/{owner}/{repo}/pulls/<number>/comments/<comment_id>/replies \
  -f body="Fixed in <short-sha> — <one-line summary of the actual change>."
```

```
gh api graphql -f query='
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <number>) {
      reviewThreads(first: 20) {
        nodes { id isResolved path line comments(first: 5) { nodes { databaseId body } } }
      }
    }
  }
}'
```

Match each `databaseId` back to the comment you replied to, then:

```
gh api graphql -f query='
mutation { resolveReviewThread(input: {threadId: "<thread-node-id>"}) { thread { isResolved } } }'
```

Multiple threads can be resolved in one GraphQL call using aliased mutation fields
(`t1: resolveReviewThread(...) { ... } t2: resolveReviewThread(...) { ... }`).

Since this pushes to the PR's own feature branch (not `main`) and only after the user
already approved the specific fixes in Phase E, this phase does not require a second
confirmation — but if the user's original ask was scoped to "just review" with no
indication they want it landed, stop after Phase F/G and ask before pushing.

## Phase J — Report

Give a concise summary: what was reviewed, what was found (marking which findings were
independently confirmed, which came only from the external review, and which external
claims were checked and rejected — with why), what was fixed vs. skipped and why,
what verification ran, the commit SHA, and push/resolve status (e.g. "PR now shows 0 open
review threads").

## Non-negotiable rules

1. Never edit code before Phase E's findings presentation and the user's explicit picks.
2. Verify claims — yours and the reviewer's — before presenting them as fact. "Sounds
   right" is not verified; a cheap empirical check usually is.
3. Never apply an external review comment's suggested fix without checking it against
   real behavior when it's checkable — a wrong "fix" for a claim that doesn't reproduce
   is worse than leaving the comment unresolved.
4. Read "surrounding code" from the PR's actual branch content, not a combined/stacked
   local working tree that may include unrelated changes from other branches.
5. Every confirmed-bug fix gets a regression test when feasible, and that test must be
   observed to fail without the fix before it's trusted to mean anything.
6. Clean up scratch verification artifacts before committing; never commit them.
7. Only commit to the PR's own branch. Only push and resolve threads once the user has
   approved the specific fixes being landed.
