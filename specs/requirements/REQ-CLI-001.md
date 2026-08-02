---
id: REQ-CLI-001
title: spectrace init
spec: SPEC-CLI-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Running `init` in a repository with no `.spectrace/` creates the configuration file with defaults and a templates directory.
  - Running `init` a second time leaves the repository unchanged and exits 0.
  - An existing file is never overwritten unless `--force` is passed.
---

# spectrace init

## Statement

Scaffold `.spectrace/` (config with defaults, templates directory) in the
current repository; idempotent; never overwrites without `--force`.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.
