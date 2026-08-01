---
id: REQ-TODO-008
title: Report list statistics
status: proposed
priority: low
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - The reported total count equals the number of tasks currently in the list.
  - The reported remaining count equals the total minus the finished count.
---

# Report list statistics

## Statement

The system shall produce a summary reporting how many tasks exist in total,
how many are finished, and how many are still remaining.

## Rationale

Users want a quick sense of overall progress without having to count tasks
themselves.

## Notes

Written from the README's "Get the numbers at a glance" feature description
before inspecting the implementation.
