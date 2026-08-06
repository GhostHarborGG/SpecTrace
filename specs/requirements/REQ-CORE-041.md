---
id: REQ-CORE-041
title: Confidence bands
spec: SPEC-CORE-000
status: implemented
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

## Notes

Implemented in `packages/core/src/review/bands.ts`. Boundaries are inclusive
at the bottom of each band: exactly 0.75 suggests, exactly 0.50 reviews.
Defaults live in `DEFAULT_CONFIDENCE_BANDS` (REQ-CORE-004) and are asserted
against the proposal's provisional policy by test, so a tuned value shipping
as a new default is a deliberate edit rather than a drift.

Bands triage attention; they never accept anything. The highest band is named
`suggest` for that reason — REQ-CORE-040 is the only thing that creates a
link.

## An `unrelated` verdict is always `discard`

Not a special case bolted on: it follows from what a band means. The bands
rank *link claims*, and `unrelated` is the absence of one. Reading confidence
alone would put a model's most emphatic "these are unrelated" at 0.95 into the
`suggest` band and present it to a reviewer as a strong link, which inverts
the answer the model actually gave. `bandFor` therefore takes the
classification as well as the confidence.

## AC2 — stored independently, which is what makes override rate measurable

A `Decision` carries `modelClassification`, `modelConfidence`, and the `band`
alongside the reviewer's `kind`. The reviewer's verdict never overwrites the
model's number. Collapse the two into a single "final" field and the question
override rate exists to answer — how often was the model wrong in a way a
human caught — becomes unanswerable without re-running the model against a
repository that has since moved on.

## Re-bucketing

`bucketProposals` takes the bands already recorded against decided proposals
and leaves those proposals at the band they were decided in; everything else
is bucketed against the thresholds passed in. A reviewer who rejected
something the tool had called a strong suggestion should still see, a month
and a threshold change later, that it *was* a strong suggestion when they
rejected it. Rewriting that band would quietly revise the record of what they
were shown, which is the failure the requirement's last clause forbids.

Discarded proposals are returned, not filtered out — "withheld but retained
and inspectable". A proposal nobody can see is a proposal nobody can find the
tool wrong about.
