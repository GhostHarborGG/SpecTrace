---
id: REQ-TODO-002
title: Complete a task
status: proposed
priority: high
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Calling completeTask on an existing task sets its completed flag to true.
  - Calling completeTask records the time the task was completed.
---

# Complete a task

## Statement

The system shall mark a task as completed when completeTask is called with
its id.

## Rationale

Marking work as done is the core progress signal the rest of the list
(summaries, filtering, sweeping) depends on.

## Notes

Written from the README's "Mark work done, and undo that if needed" feature
description before inspecting the implementation.
