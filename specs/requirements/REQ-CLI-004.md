---
id: REQ-CLI-004
title: spectrace analyze
spec: SPEC-CLI-000
status: partial
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

A subset ships today (`packages/cli/src/index.ts`): lexical retrieval only
(Configuration A), emitting ranked candidates with provenance.

AC1 holds — `--req <id>` is repeatable, restricts the run to the named
requirements, and exits 2 on an ID with no requirement document; absent, every
requirement in the directory is analyzed.

AC2 does not — confidence bands, failure records, and usage totals all belong
to the ranking requirements deferred to Phase D (REQ-CORE-030…032, 041).

AC3 holds in half: `--dry-run` reports what would be transmitted, and
`--transmission-log <file>` writes it out in full (REQ-CORE-023), with zero
model and embedding calls — there is no code path from that branch to one.
The estimated-cost half waits on usage accounting (REQ-CORE-032, Phase D),
which is what supplies token counts and per-model pricing.

Status is `partial` until AC2 and the cost half of AC3 hold.
