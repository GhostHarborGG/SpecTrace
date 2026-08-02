---
id: REQ-APP-044
title: Malformed-response and failure reporting
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - An injected malformed response appears in the failures panel and never as a reviewable proposal.
  - Failure counts per run are included in the status report (REQ-APP-022).
---

# Malformed-response and failure reporting

## Statement

When a model response fails schema validation, the application shall record
the failure with its provenance, exclude it from the review queue, and display
a failures panel with counts per run and per requirement; failures shall be
exportable alongside decision audit records.

## Rationale

The proposal treats malformed model responses as recorded failures, kept
separately for evaluation; Studio must surface them, not swallow them.

## Notes

The engine behavior this surfaces is REQ-CORE-031.
