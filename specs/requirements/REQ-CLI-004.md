---
id: REQ-CLI-004
title: spectrace analyze
spec: SPEC-CLI-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - "`--req <id>` restricts the run to the named requirements; absent, every configured requirement is analyzed."
  - Output carries proposals with confidence bands, failure records, and usage totals.
  - "`--dry-run` reports what would be transmitted and the estimated cost, and performs zero model or embedding calls."
---

# spectrace analyze

## Statement

Run retrieval and, per configuration, LLM ranking (REQ-CORE-020…032) over all
or selected (`--req <id>`) requirements; prints/emits proposals with
confidence bands, failures, and usage totals; `--dry-run` reports what would be
transmitted and estimated cost without calling any model.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

Completed 2026-08-05 with the Phase D ranking stage. All three criteria hold.

## AC1

`--req <id>` is repeatable, restricts the run to the named requirements, and
exits 2 on an ID with no requirement document; absent, every requirement in
the directory is analyzed.

## AC2 — proposals, bands, failures, usage

Ranking runs when a model is configured — `model.ranking`, or `--ranking-model`
as an override — which is what "per configuration" in the statement asks for.
With none configured the run stops after retrieval and says so, rather than
erroring: retrieval-only is a legitimate way to use this command and was the
whole of it through Phase C. `--no-rank` forces that path even when a model is
configured.

Output carries each proposal with its classification, confidence, rationale,
and the band that confidence falls in (REQ-CORE-041); failure records with
their rule, scope, and raw-payload reference (REQ-CORE-031); and per-run and
per-requirement usage totals (REQ-CORE-032). `--proposals <file>` writes the
lot as JSON, including the raw response bodies the failure references point
at, so a reader can see what the model actually said.

The bounded payload is assembled **once** and shared by the transmission log
and the ranking call, so the log does not merely describe a payload of the
same shape — it describes the exact object the model was handed
(REQ-CORE-023).

## AC3 — the dry run projects cost and still calls nothing

`--dry-run` reports what would be transmitted, and `--transmission-log <file>`
writes it out in full. There is no code path from that branch to a ranking
call: `--dry-run` suppresses ranking before the provider is constructed, and
the API key is never read on that path.

The cost half is a **projection**, since a dry run has no `usage` block to
read. Input tokens are estimated from the assembled prompts at four characters
per token; output tokens are budgeted at a fixed allowance per candidate,
because reply length is unknowable before the fact and a projection modelling
only input would read low by exactly the expensive half. Both are reported as
estimates and neither enters REQ-CORE-032's ledger, which records only what a
provider reported.

Retrieval still runs, so in semantic and hybrid mode the corpus is still
embedded — the report says how much, and that has been true since Phase C.

## Pricing is a flag, not configuration — pending BP

`--input-cost-per-mtok` and `--output-cost-per-mtok` supply the rates. With
neither given, the run is reported as **unpriced** rather than as costing zero.
Core holds no vendor price list by design (REQ-CORE-032), and a stale
hardcoded rate is worse than an absent one because it is reported with the
same confidence as a correct one.

Promoting these to `.spectrace/config.yaml` under `model` would be a
REQ-CORE-004 amendment, so flags landed first. Worth doing if the capstone
evaluation runs enough sweeps to make repeating them tedious.
