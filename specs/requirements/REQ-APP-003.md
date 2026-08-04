---
id: REQ-APP-003
title: Wiki-links and backlinks
spec: SPEC-APP-000
status: partial
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

## Notes

The link graph landed 2026-08-03 (`main/analysis.ts`), built in the same pass
as schema validation so the renderer never issues N reads to answer one
question.

**Wiki-link syntax is Studio's, not the engine's.** It appears nowhere in
SPEC-CORE-000 and should not — it is an editor affordance. Resolution is
tried in order: exact path, path missing its `.md`, bare file name, then
**requirement ID**. That last one matters most: `[[REQ-CORE-001]]` is how one
requirement cites another, and REQ-CORE-001 AC3 makes IDs independent of file
names, so ID resolution cannot be folded into path resolution.

**AC3 holds** on the reading that "elsewhere in the vault" means another
document: a link created in one document surfaces in the target's backlinks
panel inside the 400 ms analysis debounce, and unsaved buffers are included
so it appears while being typed. **It does not cover a link created by
another application** while the vault is open — that needs the external-change
watcher of REQ-APP-001 AC3, which does not exist yet. If BP reads AC3 as
covering external edits, this drops back to `proposed`.

**AC1 does not hold** — no `[[` autocomplete. **AC2 does not hold** — Studio
has no rename operation at all, so there is nothing to offer an update from.
Unresolved links are surfaced in the inspector rather than silently dropped,
which is the useful signal in their absence.
