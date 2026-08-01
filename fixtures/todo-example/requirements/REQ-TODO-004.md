---
id: REQ-TODO-004
title: Reopen a completed task
status: proposed
priority: medium
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Calling reopenTask on a completed task sets its completed flag back to false.
  - Calling reopenTask clears the task's recorded completion time.
---

# Reopen a completed task

## Statement

The system shall mark a previously completed task as not completed when
reopenTask is called with its id.

## Rationale

A task can be completed by mistake; there must be a way to undo that without
recreating the task.

## Notes

Written from the README's "Mark work done, and undo that if needed" feature
description before inspecting the implementation.
