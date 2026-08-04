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
budget.

AC2 holds as of 2026-08-03 for the one operation that exists. Saving writes
plain UTF-8 bytes with `writeFileSync` — no lock file, no sidecar, no
database — so a vault edited in Studio is indistinguishable from one edited
anywhere else, and `git diff` is how the user checks our work. Writes are
confined to the vault root and to `.md` files: a bug that lets the renderer
overwrite arbitrary files is worse than a missing feature. The statement's
create, rename, move, and delete operations are still absent.

AC3 does not hold — there is no external-change watcher, so a file edited by
another application while the vault is open is neither detected nor reloaded,
and a dirty buffer gets no conflict prompt. Status stays `partial`.
