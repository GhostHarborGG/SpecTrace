---
id: REQ-CLI-007
title: spectrace coverage
spec: SPEC-CLI-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Output carries a coverage summary and per-requirement states.
  - "`--json` output conforms to the contract Studio's dashboard consumes (SPEC-APP-000 REQ-APP-020 AC1)."
---

# spectrace coverage

## Statement

Coverage summary and per-requirement states; `--json` output is the contract
consumed by Studio's dashboard (SPEC-APP-000 REQ-APP-020 AC1).

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

This command's `--json` snapshot is a cross-package contract
(`packages/cli/test/snapshots/`, CLAUDE.md rule 5) — it becomes part of
Studio's parity suite under NFR-APP-007.
