---
id: REQ-CORE-011
title: Exclusions
spec: SPEC-CORE-000
status: partial
priority: P0
links: []
acceptance_criteria:
  - Adding an exclusion pattern and re-indexing removes the affected symbols.
  - Proposals referencing a symbol that a new exclusion pattern removed are flagged stale.
---

# Exclusions

## Statement

The indexer shall honor gitignore-style exclusion patterns from configuration
for generated, vendored, and minified paths; excluded files shall contribute
no symbols and no retrieval text.

## Notes

AC1 is implemented and tested (`packages/core/src/indexer/exclusions.ts`;
`packages/core/test/typescript-indexer.test.ts`), covering configured
patterns, repository `.gitignore`, a default excluded-directory set, minified
filenames, and generated-file marker comments.

AC2 cannot be satisfied yet — it depends on proposals existing (REQ-CORE-030,
Phase D) and on stale-link resolution (REQ-CORE-052). It was split out of the
original single compound criterion on 2026-08-02 so the implemented half is
trackable and the deferred half is explicit; no intent was added or removed.
Status is `partial` until AC2 holds.
