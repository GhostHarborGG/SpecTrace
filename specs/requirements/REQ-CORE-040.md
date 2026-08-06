---
id: REQ-CORE-040
title: Review decisions
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Grep of the codebase finds no call path from proposal generation to link storage that bypasses a decision record.
  - Decision records are exportable as JSON.
---

# Review decisions

## Statement

The engine shall support accept, reject, and redirect (re-targeting a proposal
to a different symbol) on any proposal; no path shall create an accepted link
without an explicit human decision; every decision shall record reviewer
identity, timestamp, and repository commit.

## Rationale

Proposal Step 4: a proposed link becomes an accepted link only after developer
confirmation.

## Notes

Implemented in `packages/core/src/review/decisions.ts`. `recordDecision` is
the one place proposal data crosses into a decision, and it crosses by being
*copied* — so a decision stays readable, and link state stays derivable, long
after the run that produced the proposal is gone.

Reviewer identity, timestamp, and repository commit are required on every
decision. The timestamp is passed in rather than read from the clock: core is
deterministic (NFR-CORE-002) and reads nothing ambient (CLAUDE.md rule 2). A
decision with a blank reviewer is refused rather than defaulted — an audit
trail whose identities can be empty is not an audit trail.

## AC1 — enforced by shape, not by discipline

`deriveLinkState` is the only function in the engine that produces a link, and
**its only input is decisions**. It has no parameter through which a proposal
could be passed, so "accidentally promote a high-confidence proposal straight
to a link" is not a mistake this codebase can make — it is not an expressible
operation.

That is also what makes the AC checkable the way it asks to be: grep the
callers of `deriveLinkState` and you have found every path to link state. The
alternative — a `promote(proposal)` helper with a comment asking callers to
check for a decision first — makes the same grep find nothing, and rests the
product's core claim on everyone having read the comment.

## Redirect is its own kind

Not a reject-plus-accept, because the distinction is evaluation data: a
redirect says retrieval put the reviewer in the right neighbourhood and
ranking picked the wrong door, which is a different failure from either stage
being simply wrong. A redirect may re-target the relationship as well as the
symbol.

Decisions are keyed by the symbol that was *proposed*, not the one that was
accepted, so a redirect and a later reject are decisions about the same
proposal and the reject can supersede the redirect's link.

## AC2

`serializeDecisionLog` exports the trail as JSON. Every value survives
`structuredClone` (CLAUDE.md rule 3), so Studio reads the same records over
IPC that the CLI writes to disk.
