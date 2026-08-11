---
id: REQ-APP-013
title: Link review queue
spec: SPEC-APP-000
status: partial
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Accepting a proposal writes the link to the requirement's frontmatter and the index, matching CLI storage exactly.
  - Keyboard-only triage (next/accept/reject/redirect) is possible.
  - Redirect allows searching the symbol index and attaching the corrected target.
  - The decision audit record is exportable as JSON.
---

# Link review queue

## Statement

The application shall present proposed links in a review queue grouped by the
core's confidence bands (auto-suggest > 0.75; review 0.50–0.74; discarded
< 0.50 available under a toggle), showing for each proposal the requirement,
candidate symbol with source preview, confidence, and model rationale; the
reviewer shall be able to accept, reject, or redirect each proposal, with
every decision recorded with reviewer, timestamp, and commit SHA.

## Rationale

Human confirmation is the engine's trust model; a GUI queue is where Studio
most improves on the CLI.

## Notes

**AC1 and AC2 hold as of 2026-08-10; AC3 and AC4 do not.** Status is `partial`.

## AC1 — storage matches the CLI

`apps/studio/src/main/review.ts` records decisions with core's
`recordDecision`, derives links with `deriveLinkState` — the only path from a
proposal to a stored link (REQ-CORE-040 AC1) — and writes the audit trail,
then frontmatter, then the index, in that order and for the reason
`packages/cli/src/vault.ts` documents. Verified end-to-end through the running
app: accepting one proposal and rejecting another produced the four-field
frontmatter record, a bidirectional index, and a trail carrying both verdicts.

## AC2 — keyboard triage

`a`/`r`/`d`/`s` for accept, reject, redirect, and skip; `j`/`k` or the arrows
to move. Verified by driving the built app: two keystrokes produced two held
verdicts and the queue dropped both once applied.

Decisions accumulate locally and are written in one batch, so triage runs at
keyboard speed and the trail's timestamps describe when the reviewer decided
rather than when React re-rendered. Key handling is suspended while the
redirect field has focus, so typing a symbol ID containing `a` or `s` cannot
decide the proposal underneath.

The queue withholds the `discard` band (REQ-CORE-041) and drops already-decided
proposals, and it flags stale ones without removing them (REQ-CORE-011 AC2) —
a proposal that quietly vanished would be indistinguishable from one never
generated.

## AC3 and AC4 — not implemented

**AC3** asks that redirect *search the symbol index*. The redirect control
currently takes a typed symbol ID and attaches it, which satisfies "attaching
the corrected target" but not the search half — the reviewer has to know the
ID already, which is the opposite of what the criterion is for. Needs a symbol
search channel over the index (`parseSymbolIndex` already loads it).

**AC4** asks that the audit record be exportable as JSON. The trail *is* JSON
at `.spectrace/decisions.json` and any tool can read it, but Studio offers no
export action, so the criterion is not met from inside the app.

Neither is blocked by anything; both are UI work on data that already exists.
