---
id: REQ-CLI-005
title: spectrace review
spec: SPEC-CLI-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - The interactive loop offers accept, reject, redirect, and skip on each queued proposal, with a source preview.
  - Reviewer identity comes from `--reviewer <name>` or, absent that, from git config; with neither available the command exits 2.
  - "`--decide <file>` applies a JSON decision batch without requiring a TTY."
---

# spectrace review

## Statement

Interactive terminal loop over queued proposals: accept / reject / redirect /
skip, with source preview; `--reviewer <name>` required or taken from git
config; non-interactive `--decide <file>` applies a JSON decision batch
(REQ-CORE-040).

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well — note that `review` without `--decide` is the single
command exempted from the run-non-interactively-in-CI criterion.
