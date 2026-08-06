---
id: REQ-APP-012
title: Run analysis (index, retrieve, rank)
spec: SPEC-APP-000
status: partial
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - A run over the controlled evaluation repository matches CLI output byte-for-byte at the proposal/index level.
  - Estimated cost is shown before the LLM stage starts and actual cost after it completes.
  - Cancelling mid-run leaves the last completed stage's artifacts intact.
---

# Run analysis (index, retrieve, rank)

## Statement

The application shall run the core's pipeline (index → candidate retrieval →
optional LLM ranking) over the vault's requirements against the cached
repository, displaying per-stage progress, live token/cost accounting, and
supporting cancellation; results shall be identical to an equivalent CLI
invocation at the same core version.

## Rationale

This is the core loop; Studio adds progress, cost visibility, and interruption
on top of the engine.

## Notes

**AC1 holds; AC2 and AC3 do not.** Status is `partial`.

## AC1 — parity, made structural

`apps/studio/src/main/coverage.ts` reads the vault, builds the link index from
frontmatter, and assembles the report with core's `buildCoverageReport` — the
same function `spectrace coverage` calls. The envelope was moved into core
(`packages/core/src/reporting/coverage-report.ts`) for exactly this reason: a
parity test over two independent implementations can tell you they have
diverged, but it cannot stop them diverging. With one implementation, parity
is a property of the code and the test confirms the wiring.

`apps/studio/test/parity.test.ts` asserts against
`packages/cli/test/snapshots/coverage-report.json` — the CLI's own recorded
contract file, read rather than copied, so a change on either side fails both
suites at once. Commit and engine version are normalized out; the comparison
is on serialized text, not just deep equality, because "byte-for-byte" is a
claim about key order too.

The module is Electron-free like `vault.ts` and `analysis.ts`, so the parity
suite runs in plain Node without booting a window.

## AC2 and AC3 — not implemented

Cost display (before and after the LLM stage) and mid-run cancellation are UI
and run-lifecycle work that has no Studio surface yet. The data behind AC2
exists — `analyze` already projects cost before a run and reports measured
usage after (REQ-CLI-004 AC3, REQ-CORE-032) — so what is missing is the
`runAnalysis` IPC channel that streams progress and usage into the renderer,
plus the panel that shows it. AC3 additionally needs the run to be
stage-checkpointed so an interrupted run leaves the last completed stage's
artifacts on disk.

Both are the natural next Studio increment and neither is blocked by
anything in core.
