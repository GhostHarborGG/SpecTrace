---
id: REQ-CORE-051
title: Bidirectional queries
spec: SPEC-CORE-000
status: proposed
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
