---
id: REQ-TODO-010
title: Group related tasks under a shared label
status: proposed
priority: low
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - Retrieving tasks by a given label returns every task carrying that label.
  - A task not carrying the given label is not included in the result.
---

# Group related tasks under a shared label

## Statement

The system shall let a caller retrieve every task that has been grouped
under a given label.

## Rationale

Related work often spans multiple individual tasks (a project, a context, a
person); users need a way to pull those back together.

## Notes

Written from the README's "Group related work under a label" feature
description before inspecting the implementation.
