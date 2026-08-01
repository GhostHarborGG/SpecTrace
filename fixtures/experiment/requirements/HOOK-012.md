---
id: HOOK-012
title: Pre/Post Invocation Observers
status: proposed
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - A pre-dispatch observer runs before the handler runs.
  - A post-dispatch observer runs after the handler runs.
  - Each observer can observe the invoked hook name and arguments.
---

# Pre/Post Invocation Observers

## Statement

The hook lifecycle shall support synchronous observers at both boundaries
of an invocation: a pre-dispatch observer before the handler runs and a
post-dispatch observer afterward. Each observer shall be able to observe
the invoked hook name and arguments.

## Rationale

Cross-cutting concerns such as instrumentation need visibility into every
invocation without participating in it.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
