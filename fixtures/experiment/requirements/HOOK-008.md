---
id: HOOK-008
title: Configuration-Based Teardown
status: proposed
difficulty: partial-overlap
source_documentation:
  - README.md
acceptance_criteria:
  - Multiple handlers described by a hooks configuration are detached.
  - Handlers identified through nested hook names are included in the detachment.
---

# Configuration-Based Teardown

## Statement

The system shall detach multiple handlers described by a hooks
configuration, including handlers identified through nested hook names.

## Rationale

Whatever a configuration attached, the same configuration shape must be
able to detach.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
