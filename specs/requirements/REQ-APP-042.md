---
id: REQ-APP-042
title: Confidence threshold configuration
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - Defaults match the core's shipped (evaluation-tuned) values.
  - Changing a band re-buckets pending proposals without re-invoking the model.
  - Accepted/rejected decisions are never altered by band changes.
---

# Confidence threshold configuration

## Statement

The application shall display the active confidence bands, allow per-vault
adjustment within core-validated ranges, and re-bucket existing unreviewed
proposals when bands change; active band values shall be recorded with every
analysis result.

## Rationale

The proposal defines provisional bands (auto-suggest > 0.75; review
0.50–0.74; discard < 0.50) explicitly as starting points to be tuned; the
tuned values are part of the tool's operation and must be user-visible and
adjustable.

## Notes

AC1's "core's shipped values" are `bands.suggest` and `bands.review` in
`DEFAULT_CONFIG` (REQ-CORE-004), currently the provisional 0.75 / 0.50 from
REQ-CORE-041.
