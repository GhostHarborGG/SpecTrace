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

**Resolved 2026-08-03 (BP): implement both, measure, then choose.** Two
strategies ship behind one versioned registry — `rrf-v1` (reciprocal rank
fusion, merging on ranks so no calibration is needed between unbounded BM25
scores and bounded cosine similarity) and `weighted-v1` (per-requirement
min-max normalization then an α-weighted sum). Both run on the frozen corpus
and the default is chosen from the numbers rather than guessed.

Version identifiers live in the same namespace as the lexical scoring
versions, so a merge strategy is burned the same way a BM25F revision is if it
regresses. Note that `weighted-v1` introduces a tunable α — it counts against
the same overfitting budget the Phase A measured-version cap was set to
protect, and it is measured, not tuned, unless BP reopens that budget.
