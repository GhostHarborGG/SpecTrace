---
id: REQ-CORE-001
title: Schema fields
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - A document missing any mandatory field fails validation with a message naming the field and file.
  - Trace links serialize as an array of `{symbol, reviewer, timestamp, commit}` entries readable without SpecTrace installed.
  - Identifiers are treated as opaque and stable; renaming a file does not change its requirement ID.
  - A document carrying only the mandatory fields validates; omitted optional fields resolve to their documented defaults, and a rationale supplied as a body section satisfies the rationale field.
  - A statement supplied as a `## Statement` body section satisfies the statement field, and frontmatter takes precedence over the body section when both are present.
---

# Schema fields

## Statement

A requirement document shall carry, in YAML frontmatter, a unique identifier,
a title, and a status. It may additionally carry a priority (default `P1`), a
statement, a rationale, and a set of trace links (default empty); a statement
or rationale may instead appear as a `## Statement` or `## Rationale` section
in the document body. Every requirement
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

Amended 2026-08-10 (BP): `statement` added as an optional field, read from
frontmatter or a `## Statement` body section exactly as `rationale` is. AC5
was added with the amendment to make it testable.

The reason is retrieval parity, not schema tidiness. `spectrace analyze`
builds its query text from title + statement + acceptance criteria; before
this amendment the vault schema had no statement, so Studio retrieved on
strictly less text than the CLI from the same documents, and REQ-APP-012 AC1's
byte-for-byte proposal parity was unreachable by construction. The statement
is also the single most useful field retrieval has — it is the sentence
describing what the system shall do, which is what a symbol's documentation
and signature are matched against.

Optional rather than mandatory so the amendment invalidated no existing
document, including the frozen feasibility corpus. A requirement without one
retrieves on its title and acceptance criteria alone, which is exactly the
pre-amendment behaviour.
