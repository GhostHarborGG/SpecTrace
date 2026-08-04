---
id: REQ-CORE-021
title: Semantic retrieval (Configuration B)
spec: SPEC-CORE-000
status: implemented
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

Implemented in `packages/core/src/retrieval/semantic.ts` and
`embedding-cache.ts`, with the vendor adapter in
`packages/cli/src/embedding-provider.ts`.

**Cache entries are keyed by a hash of the embedded text, not by symbol ID.**
That is the load-bearing choice. A symbol keeps its ID across edits to its
body, so a symbol-keyed cache would serve a vector for text that no longer
exists; a text-keyed one cannot. It also means identical text embeds once
however many symbols carry it, and the model identifier lives in the cache
header rather than the key, because vectors from different models are not
comparable and a cache written by another model is discarded wholesale rather
than merged. Entries the current run did not touch are pruned on write — the
cache mirrors a rebuildable index, so unbounded growth would buy nothing.

**Embedded text draws on the same fields BM25F does**, in a fixed order, so
Configurations A and B are compared on the same information and any
difference in recall is attributable to method rather than to one
configuration having been fed more. Fields are labeled rather than
concatenated bare.

**A fully cached run needs no API key at all** (added 2026-08-04). If
`--embedding-cache` points at a cache that already covers the corpus, the CLI
builds a cache-only provider from the cache header's model ID and dimensions
and refuses to embed anything new. Requiring credentials for a run that
performs zero API calls contradicted what AC1 claims, and it blocked offline
reproduction of a recorded evaluation. It also turns AC1 from an assertion
into an observation: the run either succeeds without a key — proving every
vector was cached — or fails naming how many texts were missing. A cache
built from a different corpus fails loudly rather than ranking against
whatever it happens to hold.

Surface: `spectrace analyze --mode semantic [--embedding-cache <file>]`,
reporting how many texts were embedded and how many came from cache.
Vectors are L2-normalized on the way in, so similarity is a dot product;
ties break on symbol ID so equal scores never depend on iteration order
(NFR-CORE-002).
