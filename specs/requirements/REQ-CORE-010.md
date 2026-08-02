---
id: REQ-CORE-010
title: Symbol extraction
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Re-indexing an unchanged repository yields identical symbol identifiers.
  - A symbol's identifier survives edits to its body (identity is declaration-based, not content-based).
  - Index of the controlled repository completes in under 60 s on the evaluation baseline machine.
---

# Symbol extraction

## Statement

The indexer shall extract files, classes, methods, functions, and exported
modules from TypeScript and JavaScript sources using the TypeScript Compiler
API, recording for each: a stable symbol identifier, file path, signature, and
any attached documentation comments.

## Rationale

Proposal Step 3: symbol-level granularity via the TypeScript Compiler API.
