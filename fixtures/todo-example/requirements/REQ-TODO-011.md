---
id: REQ-TODO-011
title: Clear finished work out of the active list
status: proposed
priority: low
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - After clearing, no finished item remains in the active list.
  - Every item moved out remains retrievable from the holding area afterward.
---

# Clear finished work out of the active list

## Statement

The system shall be able to move every finished item out of the active list
and into a separate holding area, so the active list only shows work that is
still in progress.

## Rationale

A long-running list accumulates finished work that clutters the view of
what's actually left to do, but that history shouldn't be discarded outright.

## Notes

Written from the README's "Keep the active list uncluttered" feature
description before inspecting the implementation.
