---
id: HOOK-005
title: One-Time Hook
status: proposed
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - A handler registered with `hookOnce(name, fn)` is unregistered once it is called.
  - The `unregister` function returned by `hookOnce` can remove the handler before its first call.
---

# One-Time Hook

## Statement

The `hookOnce(name, fn)` operation shall unregister the hook once it is
called, and its returned `unregister` function shall be able to remove the
handler before its first call.

## Rationale

Run-once behavior must not depend on the handler remembering to remove
itself.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
