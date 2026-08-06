---
id: REQ-CLI-007
title: spectrace coverage
spec: SPEC-CLI-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Output carries a coverage summary and per-requirement states.
  - "`--json` output conforms to the contract Studio's dashboard consumes (SPEC-APP-000 REQ-APP-020 AC1)."
---

# spectrace coverage

## Statement

Coverage summary and per-requirement states; `--json` output is the contract
consumed by Studio's dashboard (SPEC-APP-000 REQ-APP-020 AC1).

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

This command's `--json` snapshot is a cross-package contract
(`packages/cli/test/snapshots/`, CLAUDE.md rule 5) — it becomes part of
Studio's parity suite under NFR-APP-007.

Implemented 2026-08-06.

## AC1

`summary` carries totals by link state; `requirements` carries one row per
requirement with its state, link count, and broken-link count. The totals are
folded out of the rows by core in a single pass (REQ-CORE-051 AC2), so they
cannot drift from the rows they summarize.

Three states, not two: `linked`, `stale`, `unlinked`. A requirement whose
links all point at symbols that no longer resolve is `stale`, because calling
it covered is the false assurance REQ-CORE-052 exists to prevent.

## Staleness is opt-in, and its absence is stated

Without `--index <file>` there is no honest way to know whether a link still
resolves, so the report says `stalenessChecked: false` and the plain output
says so in words. Defaulting to "assume every link resolves" would report
coverage the vault has not earned, and would do it silently — the failure mode
is a green dashboard over a repository that has moved on.

With an index, broken links are listed with the last commit each is known to
have resolved at, and they remain in the coverage rows rather than being
filtered out.

## AC2 — the recorded contract

`packages/cli/test/snapshots/coverage-report.json` is the first entry in the
Phase D snapshot set. Commit and engine version are normalized out before
comparison: those vary per machine and per release, and a contract that fails
on a new commit is a contract nobody keeps. Everything else — the artifact
name, the version, the summary keys, the per-requirement row shape — is
compared exactly.

**Recorded, not updated** (CLAUDE.md rule 5): the snapshots directory was
empty and its README reserves it for "Phase D onward", so this establishes the
contract rather than revising one. Changing it later needs explicit
instruction.
