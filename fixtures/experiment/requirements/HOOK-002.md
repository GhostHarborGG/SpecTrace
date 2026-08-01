---
id: HOOK-002
title: Ordered Asynchronous Pipeline
status: proposed
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Awaiting a hook invocation runs the selected hook's handlers sequentially.
---

# Ordered Asynchronous Pipeline

## Statement

A caller awaiting a hook invocation shall observe the selected hook's
handlers being run sequentially.

## Rationale

Callers depend on handlers not overlapping so that each sees the effects of
the ones before it.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
