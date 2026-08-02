---
id: REQ-CORE-052
title: Stale link resolution
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Deleting a linked symbol and re-indexing leaves the link present and flagged, with its last-resolved commit recorded.
---

# Stale link resolution

## Statement

A link whose symbol no longer resolves at the current commit shall be reported
as broken (feeding D1/D2 classification), never silently dropped.
