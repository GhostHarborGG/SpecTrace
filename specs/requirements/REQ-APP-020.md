---
id: REQ-APP-020
title: Coverage dashboard
spec: SPEC-APP-000
status: proposed
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
