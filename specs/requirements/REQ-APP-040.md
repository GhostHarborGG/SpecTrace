---
id: REQ-APP-040
title: Retrieval configuration (Configurations A/B/C)
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Each of configurations A, B, and C is selectable and produces results matching the CLI under the same configuration.
  - With configuration A selected and no API keys present, analysis completes with zero network calls to model providers.
  - Candidate-set size changes take effect on the next run without reindexing.
---

# Retrieval configuration (Configurations A/B/C)

## Statement

The application shall expose per-vault analysis settings for retrieval mode
(lexical, semantic, hybrid), candidate-set size, and embeddings on/off,
defaulting to the configuration the capstone evaluation recommends;
configuration A shall run with no LLM or embedding API access whatsoever.

## Rationale

The proposal's three evaluated configurations (A: BM25 lexical; B: embeddings;
C: hybrid + LLM ranking) are core capabilities, not internals; users must be
able to choose the cost/quality point the evaluation report describes —
including running fully offline with no model access.

## Notes

The settings this surfaces are already specified and implemented on the engine
side by REQ-CORE-004: `retrieval.mode` and `retrieval.topK` in
`.spectrace/config.yaml`. Studio edits that file rather than keeping its own.
