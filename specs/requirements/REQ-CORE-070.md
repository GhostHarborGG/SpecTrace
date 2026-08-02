---
id: REQ-CORE-070
title: Retrieval evaluation metrics
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Default k set is {1, 3, 5, 10}; a requirement whose relevant symbols all fall outside the retained candidates contributes reciprocal rank 0 (prelim spec §10.3).
  - Only `implements` links within the selected label passes count as relevant; `supports` links never do (prelim spec §7.3).
  - The metrics report is deterministic at fixed inputs and survives `structuredClone`.
---

# Retrieval evaluation metrics

## Statement

Given retrieval results, the requirement set they were produced for, and a
ground-truth links file, the engine shall compute macro-averaged Recall@k,
Hit@k (as a percentage), and mean reciprocal rank for configurable k values,
reported overall and per requested slice (difficulty stratum, label-pass set
per prelim spec §10.4); requirements with no in-scope ground-truth link shall
be excluded from averages and enumerated in the report, not silently scored as
zero.

## Rationale

Evaluation Plan / prelim spec §10: feasibility and capstone claims rest on
Recall@k, Hit@k, and MRR against labeled ground truth; the engine computes them
itself so measured code is shipped code.
