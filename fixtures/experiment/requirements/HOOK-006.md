---
id: HOOK-006
title: Flattened Bulk Registration
status: proposed
difficulty: high-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - The `addHooks(configHooks)` operation flattens and registers a hooks object.
  - Nested `test.before` and `test.after` entries are registered as `test:before` and `test:after`.
  - The returned `unregister` function removes the handlers registered by that operation.
---

# Flattened Bulk Registration

## Statement

The `addHooks(configHooks)` operation shall flatten and register a hooks
object, mapping nested `test.before` and `test.after` entries to
`test:before` and `test:after`, and shall return an `unregister` function
that removes the handlers registered by that operation.

## Rationale

Configuration-shaped registration keeps large hook sets declarative and
reversible as a unit.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
