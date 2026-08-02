---
id: REQ-APP-041
title: Repository exclusion configuration
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - Pattern edits persist to the core's configuration file in the vault, readable by the CLI unchanged.
  - The excluded-file count updates after edit without a full analysis run.
---

# Repository exclusion configuration

## Statement

The application shall provide an editor for the core's exclusion
configuration with gitignore-style patterns, showing a live count of files
currently excluded from indexing.

## Rationale

The proposal's indexer honors a .gitignore-style exclusion list for generated,
vendored, and minified paths; Studio must let users author it, not just
inherit it.

## Notes

AC1's "core's configuration file" is `.spectrace/config.yaml`, `exclude` key
(REQ-CORE-004); the matching engine is REQ-CORE-011.
