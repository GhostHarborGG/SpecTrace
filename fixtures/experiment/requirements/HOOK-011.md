---
id: HOOK-011
title: Hook-Name Deprecation Mapping
status: proposed
difficulty: domain-vocabulary
source_documentation:
  - README.md
acceptance_criteria:
  - An obsolete hook name can be mapped to its replacement name.
  - Multiple old-to-new hook-name mappings can be defined as one configuration.
---

# Hook-Name Deprecation Mapping

## Statement

The hook registry shall support mapping an obsolete hook name to its
replacement and defining multiple old-to-new hook-name mappings as one
configuration.

## Rationale

Hosts must be able to rename extension points without breaking consumers
that still use the old names.

## Notes

Statement wording authored by BP; transcribed to schema format only
(see docs/ai-assistance.md).
