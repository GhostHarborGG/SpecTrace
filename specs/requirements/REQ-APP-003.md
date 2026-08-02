---
id: REQ-APP-003
title: Wiki-links and backlinks
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - "Typing `[[` opens autocomplete over file names, aliases, and requirement IDs."
  - Renaming a file offers to update inbound wiki-links.
  - Backlinks panel updates within 1 s of a link being created elsewhere in the vault.
---

# Wiki-links and backlinks

## Statement

The editor shall support `[[wiki-link]]` syntax with autocomplete against
vault files and requirement IDs, and every document shall display a backlinks
panel listing documents that link to it.

## Rationale

Backlinks are the mechanism by which a spec becomes a knowledge base rather
than a folder of documents.
