---
id: REQ-CORE-001
title: Schema fields
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - A document missing any mandatory field fails validation with a message naming the field and file.
  - Trace links serialize as an array of `{symbol, reviewer, timestamp, commit}` entries readable without SpecTrace installed.
  - Identifiers are treated as opaque and stable; renaming a file does not change its requirement ID.
  - A document carrying only the mandatory fields validates; omitted optional fields resolve to their documented defaults, and a rationale supplied as a body section satisfies the rationale field.
---

# Schema fields

## Statement

A requirement document shall carry, in YAML frontmatter, a unique identifier,
a title, and a status. It may additionally carry a priority (default `P1`), a
rationale, and a set of trace links (default empty); a rationale may instead
appear as a `## Rationale` section in the document body. Every requirement
document shall contain at least one verifiable acceptance criterion, in
frontmatter or body.

## Rationale

Proposal Step 2: a requirement that cannot be identified and verified cannot
be traced.

## Notes

Amended 2026-08-02 (BP): the original wording made rationale and priority
mandatory frontmatter fields. The frozen feasibility corpus
(`fixtures/experiment/requirements/HOOK-001..012.md`, SHA-256 recorded in
`requirements.sha256`) carries its rationale as a body section and no priority
at all, and its frontmatter feeds retrieval query text — re-freezing it to
satisfy a stricter schema would invalidate the Phase A gate evidence. The
schema relaxes instead; the freeze holds and the corpus validates unmodified.
AC4 was added with the amendment to make the relaxation testable.
