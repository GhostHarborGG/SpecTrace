---
id: REQ-APP-001
title: Open and manage a vault
spec: SPEC-APP-000
status: partial
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Opening a directory containing markdown files displays them in a file tree within 2 s for vaults up to 1,000 files.
  - File operations performed in Studio are ordinary filesystem operations, visible to external tools immediately.
  - Files edited externally while the vault is open are detected and reloaded (or a conflict prompt shown if the buffer is dirty).
---

# Open and manage a vault

## Statement

The application shall open a local directory as a vault, display its markdown
files in a navigable file tree, and support creating, renaming, moving, and
deleting files and folders.

## Rationale

The vault is the unit of everything else; without Obsidian-grade vault
ergonomics the product has no wedge.

## Notes

AC1 holds as of the Phase 3 walking skeleton: `apps/studio/src/main/vault.ts`
builds the tree, with a test covering a 1,000-file vault inside the 2 s
budget. AC2 and AC3 do not — the skeleton is read-only, with no file
operations and no external-change watcher.
