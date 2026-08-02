---
id: REQ-CORE-040
title: Review decisions
spec: SPEC-CORE-000
status: proposed
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
