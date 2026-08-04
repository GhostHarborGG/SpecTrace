---
id: REQ-CORE-023
title: Bounded candidate sets
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - A run's transmitted-content log contains exactly (requirements × ≤k) candidate excerpts and nothing else.
---

# Bounded candidate sets

## Statement

Only the requirement text and its top-k candidates shall ever be transmitted
to a model; no operation shall transmit repository content outside the
candidate set.

## Rationale

The proposal's central architectural decision: cost proportional to
requirements, not repository size; operation beyond a single context window.

## Notes

Implemented in `packages/core/src/transmission/bounded-payload.ts` as the
single gate every model payload passes through. The bound is structural
rather than conventional:

- The module never receives a repository path — as with retrieval
  (REQ-CORE-020), excerpt text can only come from already-indexed symbols, so
  "read one more file while we're here" is not expressible.
- `buildTransmissionUnits` resolves symbols *through* the requirement's
  candidate list, never through the symbol table directly, so a candidate
  outside the retrieved set cannot be built into a payload.
- Every field is length-budgeted, so payload size is bounded by
  (requirements × k × budget) rather than by what happens to be in one file.

`auditTransmissionLog` is the checkable half: given a log and the run it
claims to describe, it re-derives the permitted excerpt count and reports
excess (`excess-candidates`, `unretrieved-candidate`, `unknown-requirement`,
`duplicate-requirement`, `oversized-field`). A log that *omits* a requirement
is reported as incomplete but still `bounded` — boundedness is about excess
only. That distinction is what makes AC1 checkable after the fact rather than
only by inspection, and it is what lets clients reveal exactly what would be
or was sent (NFR-CORE-005).

Surfaced by `spectrace analyze --dry-run [--transmission-log <file>]`, which
has no code path to a model or embedding call. Ranking (REQ-CORE-030, Phase D)
consumes these units; it does not assemble its own.
