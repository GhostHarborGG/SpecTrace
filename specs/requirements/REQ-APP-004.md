---
id: REQ-APP-004
title: Frontmatter-aware requirement documents
spec: SPEC-APP-000
status: partial
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

The engine half was already in place: REQ-CORE-001/002 provide parsing,
duplicate detection, and single-pass violation reporting, and REQ-CORE-003
provides templates with generated unique IDs.

**AC2 holds as of 2026-08-03** — this is the Phase C gate criterion. Studio
re-analyzes the whole vault through `@spectrace/core` 400 ms after the last
keystroke, **with the unsaved buffer substituted for the file's on-disk
content**. That substitution is the load-bearing part: without it, validation
would describe the last save rather than what is on screen, and a duplicate
typed but not yet saved would not surface at all. Both offending documents
are flagged — inline above the editor for the open one, and with a marker in
the file tree for the other — well inside the 2 s budget. Studio makes no
schema judgement of its own; it renders core's.

**AC1 does not hold.** Core supplies templates and `nextRequirementId`, but
Studio has no create-from-template surface yet.

**AC3 does not hold.** The properties panel renders ID, title, status, and
priority, with status and priority as chips — but trace-link entries are not
rendered at all, let alone as navigable chips.

Status is `partial` until AC1 and AC3 hold.
