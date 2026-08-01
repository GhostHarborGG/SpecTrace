---
id: REQ-TODO-012
title: Persist the list across application restarts
status: proposed
priority: high
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - Saving the list and then reloading it from the same location reproduces the same tasks.
  - Reloading a saved list restores each task's completion state.
---

# Persist the list across application restarts

## Statement

The system shall be able to save the current list to durable storage and
reload it later, so the list survives an application restart.

## Rationale

An in-memory-only list is worthless the moment the application closes; the
whole point of a to-do list is that it's still there tomorrow.

## Notes

Written from the README's "Make it survive a restart" feature description
before inspecting the implementation.
