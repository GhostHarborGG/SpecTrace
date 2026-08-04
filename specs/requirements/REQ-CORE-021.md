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

## Notes

**Embedding model decided 2026-08-03 (BP): OpenAI `text-embedding-3`.** The
model identifier is configuration (`model.embedding`), not a compile-time
choice, so this decision sets the Phase C evaluation baseline rather than
constraining the engine.

The API key is passed in explicitly by the client — the engine reads no
environment variables (CLAUDE.md rule 2), so core receives an injected
embedding provider and never constructs one. That also makes AC1 testable
without a network: a deterministic fake provider counts its own calls, and the
second run at the same commit must not increment it.

Cache invalidation is per symbol on content change, which the index already
gives us — a symbol's identity is declaration-based (REQ-CORE-010) while its
`normalizedSource` is content, so hashing the embedded text is what decides
whether a cached vector still applies.
