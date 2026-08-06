---
id: REQ-CORE-051
title: Bidirectional queries
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Symbol→requirements lookup at controlled-repo scale returns in under 500 ms.
  - Coverage totals reconcile with per-requirement states exactly.
---

# Bidirectional queries

## Statement

The engine shall answer: code units linked to a requirement; requirements
linked to a symbol; requirements with no accepted links; and coverage summary
(counts by link state).

## Notes

Implemented in `packages/core/src/links/link-index.ts`. All four questions are
answered against the generated index (REQ-CORE-050), never by scanning the
vault.

## AC1 — the reverse direction is materialized, not searched

`bySymbol` is built at index time, so `requirementsForSymbol` is a dictionary
lookup rather than a scan over links. The 500 ms budget is about four orders
of magnitude of headroom: the test builds a 10,000-link index and runs a
thousand lookups against a budget of 500 ms for one.

Materializing costs a second copy of the mapping in the artifact, which is the
right trade — the index is rebuilt occasionally and queried constantly, and
Studio queries it on a UI thread where a scan would be felt.

## AC2 — totals derived from the rows they summarize

`coverageSummary` computes the per-requirement rows first and folds the totals
out of them in one pass, so "coverage totals reconcile with per-requirement
states exactly" is a property of the construction rather than a claim a test
has to police from outside. Same discipline as usage accounting
(REQ-CORE-032), and for the same reason: a totals field that can drift from
its rows is worse than no totals field.

## Three link states, not two

`linked`, `stale`, `unlinked`. A requirement whose links all point at symbols
that no longer resolve is reported `stale` rather than `linked`, because it is
not covered in any sense a reader would accept, and reporting it as covered is
the exact false assurance REQ-CORE-052 exists to prevent. Staleness is
supplied by the caller (`resolveLinks`), so coverage stays a pure function and
a client that has not re-indexed gets an honest "no staleness information"
rather than a stale answer dressed as a fresh one.
