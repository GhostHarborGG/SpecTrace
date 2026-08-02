---
id: REQ-APP-005
title: Specification templates
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - All core templates are available from the new-document flow.
  - A markdown file in `.spectrace/templates/` appears as a template option without restart.
---

# Specification templates

## Statement

The application shall ship the core's templates (use case, functional
requirement, non-functional requirement, ASR, acceptance criteria) as
new-document options, and shall support user-defined templates in the vault.

## Rationale

Mirrors the CLI's Step 2 deliverable; templates are how a team without specs
gets started.

## Notes

The templates themselves exist (REQ-CORE-003) and `spectrace init` already
writes them to `.spectrace/templates/` (REQ-CLI-001), which is the directory
AC2 watches. Only the Studio new-document flow is outstanding.
