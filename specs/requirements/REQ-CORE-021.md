---
id: REQ-CORE-021
title: Semantic retrieval (Configuration B)
spec: SPEC-CORE-000
status: proposed
priority: P1
links: []
acceptance_criteria:
  - Second run at the same commit performs zero embedding API calls.
---

# Semantic retrieval (Configuration B)

## Statement

When embeddings are enabled in configuration, the engine shall retrieve
candidates by embedding similarity between requirement text and symbol text,
using a configured embedding model; embedding vectors shall be cached and
invalidated per symbol on content change.
