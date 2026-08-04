---
id: REQ-CORE-022
title: Hybrid retrieval (Configuration C)
spec: SPEC-CORE-000
status: partial
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

Implemented in `packages/core/src/retrieval/hybrid.ts`.

**The candidate pool is wider than the output.** Each configuration retrieves
`2k` and the merged list is truncated to `k` afterwards, because a merge of
two lists already truncated to `k` can only see `k` items per list — and the
premise of hybrid retrieval is that the lists disagree. Semantic retrieval
costs per symbol embedded rather than per k, so the wider pool is free there;
lexical is local.

**Selection is by configuration, not by flag.** `spectrace analyze` reads
`retrieval.mode` and `retrieval.topK` from `.spectrace/config.yaml` and treats
every command-line option as an override, so changing the file alone switches
between Configurations A, B, and C against the same index artifact.

`rrf-v1` is the provisional default. It merges on ranks, so it needs no
calibration between unbounded BM25 scores and cosine similarities bounded to
[−1, 1] — the scale mismatch that makes a naive weighted sum fragile. That is
a reason to make it the one to beat, not a measurement; **the default is BP's
to confirm once both strategies have run on the frozen corpus.**

Status is `partial`: the merge strategies, their versioned identity, and
configuration-driven selection are implemented and tested, but the criterion's
second clause — the evaluation harness running all three against the same
index — is a capability that has not yet been demonstrated end to end, since
Configurations B and C need a live embedding key. It flips to `implemented`
with that comparison run.
