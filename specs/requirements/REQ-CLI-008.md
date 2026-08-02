---
id: REQ-CLI-008
title: spectrace drift
spec: SPEC-CLI-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Warnings are printed grouped by category D1–D5.
  - "`--full` disables incremental scoping."
  - "`--confirm <warningId>` and `--dismiss <warningId>` record dispositions against the named warning."
---

# spectrace drift

## Statement

`spectrace drift <fromRef> <toRef>` runs drift analysis (REQ-CORE-060…063);
`--full` disables incremental scoping; `--confirm <warningId>` /
`--dismiss <warningId>` record dispositions; prints warnings grouped by
category D1–D5.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.
