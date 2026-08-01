---
id: HOOK-003
title: Fail-Fast Rejection Semantics
status: proposed
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - A hook-callback failure surfaces as a rejection from the hook invocation.
  - The failure is not absorbed through a global error hook or console logging.
---

# Fail-Fast Rejection Semantics

## Statement

The hook pipeline shall surface a hook-callback failure as a rejection from
the hook invocation instead of absorbing the failure through a global error
hook or console logging.

## Rationale

Failures must reach the invoking caller so they can be handled where the
invocation happened.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
