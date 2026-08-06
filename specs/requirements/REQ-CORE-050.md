---
id: REQ-CORE-050
title: Dual storage
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Frontmatter and index never disagree after any single operation (transactional write or ordered write + repair).
  - Rebuild from frontmatter alone reproduces the bidirectional index exactly.
---

# Dual storage

## Statement

Accepted links shall be written to the requirement's frontmatter and to the
generated index at `.spectrace/index.json`, which maps requirement IDs →
symbol IDs and symbol IDs → requirement IDs; the index shall be rebuildable
from specifications plus repository.

## Rationale

Proposal Step 5: human-readable frontmatter for people and tools without
SpecTrace; generated index for the machine.

## Notes

Implemented in `packages/core/src/links/link-index.ts`. Core writes no files —
it builds the index and reconciles it, and the CLI and Studio own the
filesystem. Both are bound to the ordering below.

## AC2 — the index is a pure function of frontmatter

`buildLinkIndex` takes requirements and a commit, and nothing else. There is
no repository parameter and no decision-log parameter, so the index
*cannot* contain anything frontmatter does not already say. Both directions
are sorted, so rebuilding at the same commit from the same documents is
byte-identical and a re-index produces an empty diff rather than churn
(NFR-CORE-002). Document order does not affect the result.

## AC1 — write ordering, and why this order

**Frontmatter first, then the index.** Frontmatter is the source of truth, so
a crash between the two writes leaves an index that is merely stale —
detectable by `reconcileLinkIndex` and repaired by rebuilding. The reverse
order could leave an index asserting a link no requirement document records,
which is the one failure a rebuild cannot fix, because there is nothing
authoritative left to rebuild *from*.

`reconcileLinkIndex` reports three rules — `missing-from-index`,
`absent-from-frontmatter`, `field-mismatch` — all in one pass, matching the
convention in schema validation (REQ-CORE-002) and the transmission audit
(REQ-CORE-023).

## Open question for BP: relationship is not in frontmatter

`TraceLinkRecord` (REQ-CORE-001 AC2) is four flat string fields — symbol,
reviewer, timestamp, commit — with no `implements`/`supports` distinction, and
the schema parser drops any fifth key. Since AC2 above requires the index to
be reproducible from frontmatter *alone*, anything the index carried that
frontmatter cannot express would make that criterion unsatisfiable.

**Resolved for now by having the index carry exactly what frontmatter
carries.** The relationship is not lost — it lives on the decision that
created the link (REQ-CORE-040), in the audit trail, which is where evaluation
reads it from when comparing proposals against ground-truth relationships
(REQ-CORE-070). The division is that the index answers *what links exist* and
the trail answers *why, and of what kind*.

The cost is that a client wanting to show `implements` vs `supports` in a link
list must read the trail as well as the index. If BP would rather have it
queryable from the index alone, that is an amendment to REQ-CORE-001 adding an
optional fifth key plus a parser change — proposed, not assumed.

## Naming hazard

The link index is `.spectrace/index.json`; the *symbol* index (REQ-CORE-012)
is `.spectrace/index.jsonl`. Two artifacts one character apart invites exactly
the mistake it looks like. Both are named by exported constant so nothing
hardcodes either path, but BP may want to rename one (`links.json` would do)
before the format is frozen.
