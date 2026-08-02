---
id: REQ-CLI-006
title: spectrace links
spec: SPEC-CLI-000
status: proposed
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
