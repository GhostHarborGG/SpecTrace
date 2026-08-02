---
id: REQ-CORE-023
title: Bounded candidate sets
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - A run's transmitted-content log contains exactly (requirements × ≤k) candidate excerpts and nothing else.
---

# Bounded candidate sets

## Statement

Only the requirement text and its top-k candidates shall ever be transmitted
to a model; no operation shall transmit repository content outside the
candidate set.

## Rationale

The proposal's central architectural decision: cost proportional to
requirements, not repository size; operation beyond a single context window.
