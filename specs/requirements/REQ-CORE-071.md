---
id: REQ-CORE-071
title: Run artifacts
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Identical inputs yield identical artifacts, excluding explicitly labeled timestamp fields.
  - "Retrieve → persist → evaluate round-trips: metrics computed from a persisted results artifact equal metrics computed from the same results in memory."
---

# Run artifacts

## Statement

Retrieval results and evaluation reports shall be persistable as documented,
versioned JSON/JSONL artifacts carrying provenance (repository commit, tool
configuration, engine version), and the evaluation entry point shall accept a
previously persisted results artifact as input.

## Rationale

Prelim spec §15: every reported number must be reproducible from recorded
inputs; run records are the provenance trail the evaluation report cites.
