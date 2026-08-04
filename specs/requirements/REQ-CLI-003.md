---
id: REQ-CLI-003
title: spectrace index
spec: SPEC-CLI-000
status: implemented
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

"Build or update" is honored at the granularity the engine supports today: an
index whose recorded commit, engine version, and exclusion set match the
current run is reused rather than rebuilt, and only when the working tree is
clean — the index artifact itself is discounted from that dirtiness check,
since it is a build output. `--rebuild` skips the check, discards the existing
file, and re-indexes (AC2). Per-file incremental scoping is REQ-CORE-060 and
belongs to Phase F; this command does not attempt it.

Exclusion patterns come from `.spectrace/config.yaml` (REQ-CORE-011);
`--exclude` adds to them rather than replacing them, and the resulting set is
recorded in the artifact header so a changed exclusion set invalidates reuse.
