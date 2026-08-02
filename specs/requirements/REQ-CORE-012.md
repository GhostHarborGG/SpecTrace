---
id: REQ-CORE-012
title: Local index artifact
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Delete index → rebuild at same commit → byte-identical index.
---

# Local index artifact

## Statement

The index shall be persisted locally in a documented format and shall be fully
rebuildable from the specifications and repository content alone (no
information exists only in the index).
