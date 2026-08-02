---
id: REQ-CORE-050
title: Dual storage
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Frontmatter and index never disagree after any single operation (transactional write or ordered write + repair).
  - Rebuild from frontmatter alone reproduces the bidirectional index exactly.
---

# Dual storage

## Statement

Accepted links shall be written to the requirement's frontmatter and to the
generated index at `.spectrace/index.json`, which maps requirement IDs →
symbol IDs and symbol IDs → requirement IDs; the index shall be rebuildable
from specifications plus repository.

## Rationale

Proposal Step 5: human-readable frontmatter for people and tools without
SpecTrace; generated index for the machine.
