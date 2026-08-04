---
id: REQ-CORE-022
title: Hybrid retrieval (Configuration C)
spec: SPEC-CORE-000
status: implemented
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

## Measured, 2026-08-04 — `rrf-v1` stands as the default

All four configurations were run against the same index on the frozen
`hookable` corpus (BP ran A/B/C; the `weighted-v1` arm was added from the
embedding cache at zero API cost). Overall figures:

| | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| A lexical `bm25f-v5` | .250 | .708 | .750 | .917 | .515 |
| B semantic `text-embedding-3-small` | .625 | .792 | **1.000** | 1.000 | .774 |
| C `rrf-v1` | .625 | .792 | .875 | 1.000 | **.794** |
| C `weighted-v1` | .583 | **.833** | .875 | 1.000 | .750 |

**Decision: `rrf-v1` remains the default.** It leads on MRR (.794 vs .750)
and R@1, ties at R@5 and R@10, and trails only at R@3. The margin is thin —
see the caveat below — so the tie-break is the standing argument plus the
fact that `rrf-v1` has no tunable: `weighted-v1`'s α would have to be
justified and would spend overfitting budget to win back a gap this small.

**The caveat that governs all of this: n = 12.** One requirement is 0.083 of
overall recall and 0.25 of a per-stratum figure. The `rrf-v1`/`weighted-v1`
spread is at most 0.042 overall — **half a requirement**. That is not
evidence of a better strategy; it is a coin landing. The honest statement is
that the two strategies are indistinguishable on this corpus and `rrf-v1` was
kept on parsimony. The A-vs-B gap, by contrast, is 3 requirements at R@5 and
holds in the same direction at every k and every stratum — that one is real.

**Hybrid does not earn its place over semantic here.** At R@5, C scores .875
against B's 1.000: merging in the weaker lexical list *costs* a requirement
that semantic alone retrieved. RRF gives each list an equal vote, and on this
corpus the lists are not of equal quality. C's only edge is MRR (+.020 over
B), which is inside the half-requirement noise floor. Recorded here rather
than acted on: changing the default `retrieval.mode` is a cost decision as
well as a quality one, and belongs to BP.

AC1 now holds in both clauses — the three configurations are selected purely
by `.spectrace/config.yaml`, and the harness has run all of them against one
index.
