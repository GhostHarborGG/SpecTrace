---
id: REQ-CORE-063
title: Provenance on results
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Re-running under a different model snapshot yields a second result set and a machine-readable diff against the first.
---

# Provenance on results

## Statement

Every proposal, drift warning, and report shall embed a provenance record (the
tuple of repository commit SHA, tool configuration, model snapshot, prompt
version, confidence bands, and core version); results produced under different
provenance shall be stored as distinct result sets and diffed, not
overwritten.

## Rationale

Proposal Evaluation Plan: every reported result carries the commit,
configuration, model snapshot, and prompt version that produced it.
