---
id: REQ-CORE-011
title: Exclusions
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Adding an exclusion pattern and re-indexing removes the affected symbols.
  - Proposals referencing a symbol that a new exclusion pattern removed are flagged stale.
---

# Exclusions

## Statement

The indexer shall honor gitignore-style exclusion patterns from configuration
for generated, vendored, and minified paths; excluded files shall contribute
no symbols and no retrieval text.

## Notes

AC1 is implemented and tested (`packages/core/src/indexer/exclusions.ts`;
`packages/core/test/typescript-indexer.test.ts`), covering configured
patterns, repository `.gitignore`, a default excluded-directory set, minified
filenames, and generated-file marker comments.

AC2 was split out of the original single compound criterion on 2026-08-02 so
the implemented half stayed trackable while the deferred half stayed explicit;
no intent was added or removed. It was blocked on proposals existing
(REQ-CORE-030) and on stale-link resolution (REQ-CORE-052), both of which
landed in Phase D. **AC2 holds as of 2026-08-10; status is `implemented`.**

## AC2 — why the check lives at review, not at index time

`resolveProposals` (`packages/core/src/links/staleness.ts`) takes the
proposals, the symbol IDs present in the rebuilt index, and a path predicate,
and returns a verdict for every proposal. `spectrace review` calls it against
`.spectrace/index.jsonl` before opening the queue, flagging stale entries in
the interactive display and in `--json` output.

The indexer cannot do this itself. Exclusions remove symbols at index time,
but the proposals that reference them live in an artifact written by an
earlier `analyze` run, which the indexer neither reads nor knows about. The
ordering the criterion describes — propose, *then* exclude, then re-index — is
only observable where the two artifacts meet, and that is `review`.

Like `resolveLinks`, it returns one entry per proposal and removes none
(REQ-CORE-052's reasoning applies unchanged: a proposal that silently vanishes
from the queue is indistinguishable from one that was never generated).

## Excluded is not the same as missing

The report separates `excluded` from `missing`. An excluded symbol still
exists in the working tree and configuration is the only reason it is gone;
widening the pattern brings it straight back. A missing symbol was deleted,
renamed, or moved, which is a fact about the repository and feeds D1/D2 drift
classification in Phase F. Distinguishing them needs the path, which the index
can no longer supply once the symbol is gone, so `symbolIdPath`
(`packages/core/src/indexer/symbol-id.ts`) recovers it from the ID grammar and
`ExclusionMatcher.isExcludedPath` tests it against the current patterns —
walking ancestor directories, since `isExcludedFile` alone assumes the caller
already pruned excluded directories during a walk.

Without patterns to test against, every absent symbol is reported `missing`.
Guessing `excluded` would suppress real deletions, so the check reports what
it can prove.

**Flagged, not blocked.** A stale proposal can still be accepted; the
criterion says "flagged" and refusing the decision would be added intent. The
interactive queue warns that accepting stores a broken link, and REQ-CORE-052
catches the result on the next resolution pass. Worth BP's attention if the
softer behaviour turns out to be wrong in practice.

When no symbol index exists, `review` reports staleness as *unchecked* with a
reason rather than reporting an empty stale list — "nothing is stale" and "no
one looked" are different claims, and only one of them is earned.

## Tests

`packages/core/test/links.test.ts` covers the verdict logic (excluded vs
missing, index-beats-patterns, unparseable IDs, no-drop, `structuredClone`);
`packages/core/test/symbol-id.test.ts` covers the grammar inverse;
`packages/cli/test/review-links-coverage.test.ts` runs the criterion
end-to-end — index, propose, add the pattern, re-index, review — and separately
covers deletion and the unchecked path. The end-to-end fixture deliberately
avoids a directory named `generated`, which the default excluded set already
removes; an earlier draft used one and would have passed without the
configured pattern doing any work.
