---
id: REQ-TODO-007
title: Look up tasks by keyword
status: proposed
priority: low
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Searching for text that appears in a task's title returns that task.
  - Searching for a keyword is case-insensitive.
---

# Look up tasks by keyword

## Statement

The system shall let a caller look up tasks whose title or notes contain a
given piece of text, regardless of letter case.

## Rationale

As the list grows, scrolling through every task to find one becomes
impractical; a caller needs to jump straight to what they're thinking of.

## Notes

Written from the README's "Find something by what it says" feature
description before inspecting the implementation.
