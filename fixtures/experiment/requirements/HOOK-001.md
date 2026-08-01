---
id: HOOK-001
title: Named Dispatch
status: proposed
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - A function attached to a specific hook name is dispatched when that hook name is invoked.
---

# Named Dispatch

## Statement

After a client attaches a function to a specific hook name, invoking that
hook name shall dispatch the attached function.

## Rationale

Attaching behavior to a named extension point is the library's fundamental
contract.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
