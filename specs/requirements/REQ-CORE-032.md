---
id: REQ-CORE-032
title: Usage accounting
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Run summary totals equal the sum of per-call records.
---

# Usage accounting

## Statement

Every model and embedding call shall record input tokens, output tokens, and
estimated cost; per-run and per-requirement totals shall be reported.

## Notes

Implemented in `packages/core/src/ranking/usage.ts`. The acceptance criterion
is an identity, so totals are never accumulated alongside the records they
describe: `summarizeUsage` derives them from the records in one pass, which
makes the two incapable of drifting apart rather than merely unlikely to.
Token counts come from the provider's own accounting — core does not estimate
what a tokenizer it does not own would have counted.

## Cost is estimated from caller-supplied rates

`estimateCostUsd` takes a `ModelPricing` the caller passes in; with none
supplied it returns `0` and the run is reported as unpriced. Core does not
know what any vendor charges and should not: a hardcoded price list is wrong
the week a vendor changes it, wrong *silently*, and wrong in a number the user
is being invited to trust. Per-record costs are rounded to the microdollar so
that run totals are exact sums of stored values rather than sums that
disagree with the records by a float epsilon.

## Embedding calls count toward the run and toward no requirement

A record without a `requirementId` — an embedding call, which is corpus-wide
rather than per-requirement (REQ-CORE-021) — is included in the run total and
excluded from every per-requirement total. The asymmetry is the point: a
per-requirement cost that quietly absorbed a share of the corpus embedding
would misreport the very thing the architecture's central claim is about, that
cost scales with the number of requirements rather than the size of the
repository (REQ-CORE-023). `RankOptions.priorUsage` is how an earlier stage's
records join the run's ledger.

Per-call latency is not recorded here. PQ4's latency portion is a measurement
the harness takes around the call, not a field the engine stores; adding a
wall-clock number to a structure that must survive `structuredClone` and
compare equal across runs would make run artifacts non-deterministic
(NFR-CORE-002) for no gain.
