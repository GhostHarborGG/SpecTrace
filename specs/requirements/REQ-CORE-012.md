---
id: REQ-CORE-012
title: Local index artifact
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Delete index → rebuild at same commit → byte-identical index.
---

# Local index artifact

## Statement

The index shall be persisted locally in a documented format and shall be fully
rebuildable from the specifications and repository content alone (no
information exists only in the index).

## Notes

Format: JSONL at `.spectrace/index.jsonl` — one header line
(`spectrace.symbol-index`, version, `repositoryCommit`, `engineVersion`,
`excludePatterns`, `symbolCount`), then one symbol per line in the indexer's
deterministic order. Documented in
`packages/core/src/indexer/index-artifact.ts` and narrated in SPEC-CORE-000
§4.

Byte-identity is protected by two things beyond the indexer's existing sort:
no field is timestamped or environment-derived, and symbols are written
through an explicit field projection rather than object-literal key order, so
a refactor cannot silently change the layout.

Nothing exists only in the artifact: every header field is either an input to
indexing or a fact about the engine that produced it, and every symbol field
is derived from repository content.
