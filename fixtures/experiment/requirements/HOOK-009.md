---
id: HOOK-009
title: Complete Hook Removal
status: proposed
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - After calling `removeAllHooks`, no previously registered hook handlers remain.
---

# Complete Hook Removal

## Statement

The `removeAllHooks` operation shall remove all hook handlers.

## Rationale

A host must be able to reset its extension surface completely, for example
between test runs or reloads.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
