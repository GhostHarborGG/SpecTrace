---
id: REQ-CORE-030
title: Proposal generation
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Every stored proposal has all three fields populated.
  - Changing the prompt bumps the prompt version in all subsequent provenance records.
---

# Proposal generation

## Statement

For each candidate submitted, the model response shall be parsed into: a trace
classification, a confidence score in [0,1], and a brief rationale; the prompt
shall carry a version identifier recorded in provenance.

## Notes

Deferred to Phase D by the 2026-08-02 descope (BP). The feasibility
experiment's classification-accuracy and cost measurements (prelim PQ3, and
PQ4's token/latency/cost portion) are discharged when this lands.
