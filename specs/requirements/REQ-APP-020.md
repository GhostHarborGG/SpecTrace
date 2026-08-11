---
id: REQ-APP-020
title: Coverage dashboard
spec: SPEC-APP-000
status: partial
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Dashboard totals reconcile exactly with the core's coverage command output.
  - Clicking any count opens the corresponding filtered requirement list.
  - Badges update without a full re-analysis when a link is accepted or rejected.
---

# Coverage dashboard

## Statement

The application shall display vault-level and per-document coverage: counts
and lists of requirements with accepted links, with proposals pending review,
and with no links; each requirement document shall show a status badge derived
from this state.

## Rationale

"Implementation coverage per spec item" is half of the product's definition of
development status.

## Notes

AC1 is checked against REQ-CLI-007's `--json` output, which is the contract
this dashboard consumes.

## Notes

**AC1 and AC2 hold as of 2026-08-10; AC3 does not.** Status is `partial`.

AC1 is structural rather than tested-into-place: the dashboard renders core's
`CoverageReport`, the same envelope `spectrace coverage --json` emits, and
recomputes no total. `apps/studio/test/parity.test.ts` asserts it against the
CLI's own recorded snapshot (NFR-APP-007). Reconciliation is a property of
there being one builder.

AC2 holds — each count in the summary row is a button that filters the
requirement list to exactly what it counts.

**AC3 does not hold.** Coverage refreshes on mount and on an explicit Refresh
button, not automatically when a link is accepted or rejected in the review
queue. The criterion asks specifically for an update *without* a full
re-analysis, which the current IPC could serve — `applyDecisions` already
returns the rebuilt index — but the two surfaces share no state today.

When links have not been resolved against a symbol index the dashboard says
staleness is *unknown*, not zero. A green dashboard over a repository that has
moved on is the failure mode REQ-CORE-052 exists to prevent.
