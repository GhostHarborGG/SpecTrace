---
id: REQ-CORE-002
title: Validation rules
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Two files sharing an ID are both reported, each naming the other.
  - Validation of the controlled repository's specification set completes in under 2 s.
---

# Validation rules

## Statement

Validation shall reject duplicate identifiers across the specification set and
requirements lacking at least one acceptance criterion, and shall report all
violations in a single pass rather than failing on the first.
