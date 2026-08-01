---
id: HOOK-007
title: Targeted Deregistration
status: proposed
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Supplying a hook name and its associated function for removal detaches that particular handler when it is present.
---

# Targeted Deregistration

## Statement

Supplying a hook name and its associated function for removal shall detach
that particular handler when it is present.

## Rationale

Removal must be precise enough to leave unrelated handlers on the same name
untouched.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
