---
id: REQ-CORE-052
title: Stale link resolution
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Deleting a linked symbol and re-indexing leaves the link present and flagged, with its last-resolved commit recorded.
---

# Stale link resolution

## Statement

A link whose symbol no longer resolves at the current commit shall be reported
as broken (feeding D1/D2 classification), never silently dropped.

## Notes

Implemented in `packages/core/src/links/staleness.ts`.

## Why "never silently dropped" is the whole requirement

A dropped link and a flagged link look identical in a coverage count and mean
opposite things. A link that vanishes reads as *this requirement was never
traced*; a link that is flagged reads as *this requirement was traced and the
code moved*. Only the second is true, and only the second tells a reviewer
there is something to do.

Dropping is also the failure a tool falls into by accident rather than by
decision: rebuild the index from the symbols that currently exist and broken
links disappear without anyone having chosen that. So resolution is computed
*against* the index rather than used to filter it — `resolveLinks` returns one
verdict per stored link, the same count in the same order whether or not
anything broke, and removes nothing. A caller wanting only failures reads
`broken`; neither caller is given a way to end up with a shorter link list
than it started with.

## Last-resolved commit

Seeded from the commit the decision was made at — a reviewer accepting a link
is direct evidence the symbol existed then — and advanced each time the link
is observed to resolve at a later commit, by passing the previous run's
resolutions back in.

It is a **last-known-good marker, not a guarantee** the symbol survived every
commit in between: nothing here walks history, and claiming otherwise would be
a stronger assertion than the data supports. Phase F's incremental scoping
(REQ-CORE-060) is where commit ranges get examined; this is the point-in-time
check that feeds it.

Broken links feed D1/D2 drift classification (REQ-CORE-061, Phase F). This
module is the detection half and takes no view on what a client does about it.
