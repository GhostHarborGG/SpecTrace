---
id: REQ-TODO-006
title: Narrow the list by completion status
status: proposed
priority: medium
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Listing with an outstanding-only filter excludes finished tasks.
  - Listing with a finished-only filter excludes outstanding tasks.
---

# Narrow the list by completion status

## Statement

The system shall be able to list only the tasks that are still outstanding,
or only the tasks that have already been finished.

## Rationale

A full, unfiltered list becomes hard to work with as it grows; users need to
focus on either what's left to do or what's already done.

## Notes

Written from the README's "See only what matters right now" feature
description before inspecting the implementation.
