---
id: REQ-CORE-022
title: Hybrid retrieval (Configuration C)
spec: SPEC-CORE-000
status: proposed
priority: P1
links: []
acceptance_criteria:
  - Configurations A, B, and C are selectable purely by configuration; the evaluation harness can run all three against the same index.
---

# Hybrid retrieval (Configuration C)

## Statement

Hybrid mode shall merge lexical and semantic rankings into a single candidate
list (merge strategy documented and versioned) prior to LLM ranking.

## Notes

Open item for Phase C (BP): the merge strategy is undecided. Whatever is
chosen ships with a version identifier in the same namespace as the lexical
scoring versions.
