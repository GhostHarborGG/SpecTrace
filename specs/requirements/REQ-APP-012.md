---
id: REQ-APP-012
title: Run analysis (index, retrieve, rank)
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - A run over the controlled evaluation repository matches CLI output byte-for-byte at the proposal/index level.
  - Estimated cost is shown before the LLM stage starts and actual cost after it completes.
  - Cancelling mid-run leaves the last completed stage's artifacts intact.
---

# Run analysis (index, retrieve, rank)

## Statement

The application shall run the core's pipeline (index → candidate retrieval →
optional LLM ranking) over the vault's requirements against the cached
repository, displaying per-stage progress, live token/cost accounting, and
supporting cancellation; results shall be identical to an equivalent CLI
invocation at the same core version.

## Rationale

This is the core loop; Studio adds progress, cost visibility, and interruption
on top of the engine.
