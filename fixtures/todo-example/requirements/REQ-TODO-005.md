---
id: REQ-TODO-005
title: Edit an existing task's details
status: proposed
priority: medium
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Changing a task's title updates the stored title while its id stays the same.
  - A field not included in a change is left unmodified.
---

# Edit an existing task's details

## Statement

The system shall allow the title, notes, priority, due date, and tags of an
existing task to be changed without affecting its identity or its original
creation time.

## Rationale

Task details are rarely perfect on the first try; users need to correct or
refine them after creation.

## Notes

Written from the README's "Edit details after the fact" feature description
before inspecting the implementation.
