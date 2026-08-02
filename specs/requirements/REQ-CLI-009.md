---
id: REQ-CLI-009
title: spectrace evaluate
spec: SPEC-CLI-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - "`spectrace evaluate retrieval --results <file> --ground-truth <file> [--k <list>]` prints or emits the metrics report with its breakdowns."
  - The command requires no network access.
  - A missing or malformed input file exits 1.
---

# spectrace evaluate

## Statement

Compute evaluation metrics (REQ-CORE-070/071):
`spectrace evaluate retrieval --results <file> --ground-truth <file>
[--k <list>]` prints/emits the metrics report with its breakdowns; requires no
network access; exit 1 on missing or malformed input files.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

Passing a ground-truth path to this command is explicitly permitted under
CLAUDE.md rule 1; reading back anything beyond aggregate metrics is not.
