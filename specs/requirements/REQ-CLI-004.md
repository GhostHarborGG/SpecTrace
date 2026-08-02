---
id: REQ-CLI-004
title: spectrace analyze
spec: SPEC-CLI-000
status: proposed
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
(Configuration A), emitting ranked candidates with provenance. Confidence
bands, failures, usage totals, `--req`, and `--dry-run` all depend on the
ranking requirements deferred to Phase D.
