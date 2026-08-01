---
id: REQ-TODO-009
title: Plan a focused work order
status: proposed
priority: medium
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - An open item with high urgency is ordered before an open item with low urgency.
  - Among items of equal urgency, the item with the nearer deadline is ordered first.
---

# Plan a focused work order

## Statement

The system shall be able to order the open work items for a single focused
session, putting the most urgent items first and, among equally urgent
items, the ones closest to their deadline.

## Rationale

Presenting an unordered pile of open work forces the user to do their own
triage every time; the system should surface what to work on next.

## Notes

Written from the README's "Plan a focused work session" feature description
before inspecting the implementation. This requirement deliberately avoids
naming any specific field or method.
