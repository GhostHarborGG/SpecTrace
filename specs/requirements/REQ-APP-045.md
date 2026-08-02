---
id: REQ-APP-045
title: Index rebuild and full re-analysis
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - Deleting `.spectrace/index.json` and invoking rebuild restores an index identical to the pre-deletion state at the same SHA.
  - Full re-analysis and incremental analysis at the same SHA pair produce consistent drift conclusions, with their runtime and token counts displayed side by side.
---

# Index rebuild and full re-analysis

## Statement

The application shall provide explicit actions to (a) rebuild
`.spectrace/index.json` and all derived state from the vault and cached
repository, and (b) run a full re-analysis of all links ignoring incremental
scoping, with the UI reporting links evaluated, runtime, and token usage for
comparison against the incremental path.

## Rationale

The proposal guarantees the generated index is rebuildable from the
specifications and repository, and evaluates incremental analysis against full
analysis; both operations must be user-invokable.

## Notes

AC1 is the Studio surface of REQ-CORE-012; AC2 of REQ-CORE-060.
