---
id: REQ-APP-004
title: Frontmatter-aware requirement documents
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Creating a document from a requirement template produces schema-valid frontmatter with a unique generated ID.
  - A duplicate ID anywhere in the vault is flagged in both offending documents within 2 s.
  - Trace-link entries in frontmatter render as navigable chips, not raw YAML.
---

# Frontmatter-aware requirement documents

## Statement

When a document matches the SpecTrace requirement schema, the application
shall render frontmatter (ID, status, priority, trace links) as an editable
properties panel, validate it against the schema from `@spectrace/core`, and
surface violations (duplicate IDs, missing acceptance criteria) inline.

## Rationale

The SpecTrace schema lives in frontmatter; the editor must make schema
compliance easy rather than policed.

## Notes

The engine half is already in place: REQ-CORE-001/002 provide parsing,
duplicate detection, and single-pass violation reporting, and REQ-CORE-003
provides templates with generated unique IDs. What remains is the Studio
surface (setup plan step 4.1).
