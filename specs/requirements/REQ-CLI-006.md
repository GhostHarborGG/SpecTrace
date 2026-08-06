---
id: REQ-CLI-006
title: spectrace links
spec: SPEC-CLI-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - "`--req <id>` lists the symbols linked to that requirement."
  - "`--symbol <id>` lists the requirements linked to that symbol."
  - "`--unlinked` lists requirements with no accepted links."
---

# spectrace links

## Statement

Navigation queries (REQ-CORE-051): `--req <id>` lists linked symbols;
`--symbol <id>` lists linked requirements; `--unlinked` lists requirements
with no accepted links.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

Implemented 2026-08-06. Every query is answered from the link index built out
of frontmatter (REQ-CORE-050), so the answers cannot disagree with the
documents a reader would check them against.

Exactly one selector is required. Accepting several would mean inventing a
combining rule the statement does not describe — `--req X --unlinked` has no
obvious meaning — and silently honouring the first would answer a question
nobody asked.

Plain output is one identifier per line, so the command composes with `xargs`
and `grep` without `--json`. An unknown `--req` exits 2, because a typo
returning "no links" reads exactly like a real requirement that has none; an
unknown `--symbol` returns an empty list, since a symbol that is genuinely
linked to nothing is a normal answer rather than a mistake.
