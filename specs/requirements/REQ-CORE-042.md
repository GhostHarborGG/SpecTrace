---
id: REQ-CORE-042
title: Decision audit separation
spec: SPEC-CORE-000
status: implemented
priority: P1
links: []
acceptance_criteria:
  - Accepting then rejecting the same proposal yields two audit entries and one final link state.
---

# Decision audit separation

## Statement

The audit trail (decisions, failures, provenance) shall be append-only in
normal operation and stored distinctly from link state, so that override rates
and review effort can be computed without reconstructing history.

## Notes

Implemented in `packages/core/src/review/decisions.ts`. The trail and link
state are separate artifacts by construction: `DecisionLog` keeps every
decision ever made, in the order made, while link state is *derived* from it
by `deriveLinkState` and holds only the current answer.

Neither is reconstructible from the other, which is the point. Override rate
needs the history; the requirement frontmatter (REQ-CORE-050) needs the
current answer. A single structure serving both would have to lose one of
them — and the one it would lose is the history, because that is the one
nothing else in the system is asking for day to day.

## Append-only

`appendDecision` returns a new log rather than mutating, so a caller holding an
earlier log still holds exactly what it held. Nothing in the module removes or
rewrites an entry: a reversal is a new entry, never an edit to the old one.
AC1 falls straight out — accept then reject leaves two entries in the trail
and, because the latest decision on a proposal wins, one final link state
(none, in that case).

REQ-CORE-031's failure records are the other half of the trail. They carry the
same provenance shape — prompt version, model ID, and a raw payload reference
— so review effort and model reliability are computable from one place.

## Statistics

`reviewStatistics` computes override rate and review effort from the trail
alone, which is the "without reconstructing history" clause made concrete. An
override is a reviewer contradicting the band: rejecting what was suggested,
or accepting what would have been withheld. Redirects always count, since the
model named the wrong symbol whatever confidence it had.

Only the latest decision per proposal counts toward the rate, so a reviewer
who reverses themselves contributes one override rather than two — while
`auditEntries` still reports both, because the second look *was* review
effort even though it did not change the answer. Those two figures answering
different questions is the reason the trail and the state are kept apart.
