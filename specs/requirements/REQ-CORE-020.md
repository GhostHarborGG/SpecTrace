---
id: REQ-CORE-020
title: Lexical retrieval (Configuration A)
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - With all API settings absent, retrieval completes and emits Recall@k-measurable output.
  - Retrieval cost is independent of repository size beyond index lookup (no per-run full-text rescans).
---

# Lexical retrieval (Configuration A)

## Statement

For each requirement, the engine shall rank symbols by BM25 over symbol names,
signatures, documentation, comments, and normalized source text, returning the
top-k candidates (k from configuration); this mode shall require no network
access of any kind.

## Rationale

Proposal Step 3: the lexical baseline must be measurable without any model
access.

## Notes

Scoring configuration is versioned; `bm25f-v5` is the default as of the Phase A
gate closure (2026-08-02). Version identifiers `bm25f-v6` and `bm25f-v7` are
burned — both were measured, both regressed, and both were reverted; their
patches and run artifacts are retained for the error analysis.
