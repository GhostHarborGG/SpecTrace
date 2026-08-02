---
id: REQ-CLI-002
title: spectrace validate
spec: SPEC-CLI-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Validation covers exactly the specification paths named in configuration.
  - "`--json` emits the full violation list."
  - A specification set carrying at least one violation exits 3; a clean set exits 0.
---

# spectrace validate

## Statement

Run schema validation (REQ-CORE-001/002) over configured specification paths;
`--json` emits the violation list; exit 3 on violations.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.
