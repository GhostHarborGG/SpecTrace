---
id: REQ-CORE-031
title: Malformed-response handling
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - An injected malformed response yields a failure record, a nonzero failure count in run output, and an otherwise-completed run.
---

# Malformed-response handling

## Statement

A response failing schema validation shall be recorded as a failure with its
provenance and raw payload reference, excluded from proposals, and tallied
separately for evaluation reporting; malformed responses shall never crash a
run.
