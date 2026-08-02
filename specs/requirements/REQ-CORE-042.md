---
id: REQ-CORE-042
title: Decision audit separation
spec: SPEC-CORE-000
status: proposed
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
