---
id: HOOK-010
title: Pluggable Dispatch Policy
status: proposed
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - The dispatch function is provided with the selected handler array, the invocation arguments, and the hook name.
  - Dispatch behavior is controlled by the caller through that provided dispatch function.
---

# Pluggable Dispatch Policy

## Statement

The hook system shall support caller-controlled dispatch by providing the
dispatch function with the selected handler array, invocation arguments,
and hook name.

## Rationale

Different call sites need different dispatch policies without the registry
prescribing one.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
