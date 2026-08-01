---
id: HOOK-004
title: Registration Disposer
status: proposed
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - The `hook(name, fn)` operation returns an `unregister` function.
  - Calling the returned `unregister` function removes the registered handler.
---

# Registration Disposer

## Statement

The `hook(name, fn)` operation shall return an `unregister` function that
removes the registered handler when called.

## Rationale

Registration must be reversible by the code that performed it.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
