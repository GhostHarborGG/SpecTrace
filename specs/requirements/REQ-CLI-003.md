---
id: REQ-CLI-003
title: spectrace index
spec: SPEC-CLI-000
status: partial
priority: P0
links: []
acceptance_criteria:
  - Symbol counts by kind are printed.
  - "`--rebuild` discards any existing index and rebuilds from scratch."
---

# spectrace index

## Statement

Build or update the local symbol index (REQ-CORE-010…012); `--rebuild` forces
from scratch; prints symbol counts by kind.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

AC1 holds today (`packages/cli/src/index.ts`): the command indexes a
repository and prints counts by kind. AC2 does not — the command always builds
from scratch, and there is no incremental update path and no `--rebuild` flag,
because REQ-CORE-012 (local index artifact) is not implemented yet. Status is
`partial` until both criteria hold.
