---
id: REQ-CORE-041
title: Confidence bands
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Defaults match the proposal's provisional policy; tuned values ship as new defaults with the evaluation report.
  - Reviewer decision and model confidence are stored independently (override-rate measurable).
---

# Confidence bands

## Statement

Proposals shall be bucketed by confidence: above the suggest threshold
(default 0.75) presented as suggested links; between review thresholds
(default 0.50–0.74) queued for review; below the discard threshold (default
0.50) withheld but retained and inspectable. Thresholds are configurable;
active values are recorded in provenance; threshold changes re-bucket only
unreviewed proposals and never alter past decisions.
