---
id: SPEC-CLI-000
title: SpecTrace CLI — Tool Specification
status: Draft
version: 0.3.0
owner: Brian Parker
created: 2026-08-01
depends-on: "spectrace-core-spec.md (SPEC-CORE-000) v0.1.0"
derived-from: "CPSC 597 Proposal — SpecTrace: AI-Powered Requirements Traceability for Markdown-Based Specifications (July 2026)"
related: spectrace-product-spec.md (SPEC-APP-000)
---

# SpecTrace CLI — Tool Specification

This document specifies the SpecTrace command-line tool: the CPSC 597 capstone
deliverable and the proof of concept for the SpecTrace analysis engine.

**Engine behavior is specified elsewhere.** As of v0.3.0 the REQ-CORE family —
schema, indexing, retrieval, ranking, review, storage, drift, evaluation, and
the NFR-CORE items — lives in `spectrace-core-spec.md` (SPEC-CORE-000), with
requirement bodies in `specs/requirements/`. This document is permanent CLI
territory: commands, flags, output formats, and exit codes. It pins a core
spec version in its `depends-on` header.

**Requirement bodies live in `specs/requirements/`,** one file per
requirement, as they do for the core spec. This document carries the narrative
and the surface-wide contract; §3's table indexes the individual files and is
**generated** from their frontmatter by `pnpm spec:index` — edit the
requirement file, not the table.

## 1. Purpose and scope

The CLI is a thin surface over `@spectrace/core`. It owns argument parsing,
output formatting, exit codes, and terminal interaction, and it owns no
analysis logic of its own — anything the engine could plausibly do belongs in
core, where Studio can reach it too.

**In scope:** the nine commands of §3; human-readable and JSON output;
scriptable, CI-friendly behavior; the interactive review loop.

**Out of scope:** engine behavior (SPEC-CORE-000); any graphical interface
(SPEC-APP-000); multi-user coordination.

## 2. Dependency on the core specification

Every command in §3 is a surface over requirements specified in
SPEC-CORE-000. Where a command's statement cites REQ-CORE IDs, that citation
is the contract: the CLI adds presentation, not semantics. If a command
appears to need behavior the core spec does not describe, the core spec
changes first.

Definitions used throughout this document — symbol, candidate, proposal,
accepted link, drift warning, provenance record — are given in SPEC-CORE-000
§2 and are not restated here.

## 3. Command surface

All commands: `--json` for machine-readable output on stdout (stable,
versioned schemas shared with SPEC-APP-000); human-readable output otherwise;
diagnostics on stderr; exit code 0 success, 1 operational failure, 2 usage
error, 3 validation failure.

<!-- spectrace:begin REQ-CLI-00 -->
| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CLI-001](requirements/REQ-CLI-001.md) | spectrace init | P0 | proposed |
| [REQ-CLI-002](requirements/REQ-CLI-002.md) | spectrace validate | P0 | proposed |
| [REQ-CLI-003](requirements/REQ-CLI-003.md) | spectrace index | P0 | partial |
| [REQ-CLI-004](requirements/REQ-CLI-004.md) | spectrace analyze | P0 | proposed |
| [REQ-CLI-005](requirements/REQ-CLI-005.md) | spectrace review | P0 | proposed |
| [REQ-CLI-006](requirements/REQ-CLI-006.md) | spectrace links | P0 | proposed |
| [REQ-CLI-007](requirements/REQ-CLI-007.md) | spectrace coverage | P0 | proposed |
| [REQ-CLI-008](requirements/REQ-CLI-008.md) | spectrace drift | P0 | proposed |
| [REQ-CLI-009](requirements/REQ-CLI-009.md) | spectrace evaluate | P0 | implemented |
<!-- spectrace:end -->

**Surface-wide acceptance criteria** — these apply to every command above, in
addition to each command's own criteria:

- AC1: Every command's `--json` output validates against its published
  schema; schemas carry version fields.
- AC2: `analyze --dry-run` performs zero model and embedding calls.
- AC3: All commands run non-interactively in CI except `review` without
  `--decide`.

**Currently shipping** (`packages/cli/src/index.ts`): `index` and `analyze` as
documented subsets — see their requirement files for exactly what is missing
and why — and `evaluate retrieval` complete. The remaining six commands are
registered as stubs that exit 1 naming their target phase, so the help output
matches this table at all times.

## 4. Non-functional requirements

**NFR-CLI-001 — Scriptability.** JSON mode is side-effect-equivalent to human
mode; no command requires a TTY except interactive `review`. *(P0)*

The NFR-CORE items that also constrain the CLI — locality, determinism
boundaries, cost proportionality, performance, privacy of transmitted content
— are specified in SPEC-CORE-000 §11.

## 5. Traceability to the proposal

| Proposal element | Requirements |
|---|---|
| Step 5 — JSON/CI output, navigation commands | REQ-CLI-006/007 |
| Step 6 — drift command surface | REQ-CLI-008 |
| Evaluation Plan — metric computation entry point | REQ-CLI-009 |
| Scope — no GUI | §1 |

Engine-side traceability is in SPEC-CORE-000 §12. Evaluation methodology
(datasets, labeling procedure, drift injection procedure, RQ1–RQ4) is
intentionally not restated in either document; the proposal and the eventual
evaluation report are authoritative for it.

## 6. Document evolution

- **v0.3.0 (2026-08-02)** — REQ-CORE-001…071 and NFR-CORE-001…005 extracted
  to SPEC-CORE-000 at the Phase B schema freeze, per v0.2.0 §14; all
  requirement bodies moved to `specs/requirements/`; sections renumbered; a
  `depends-on` header added pinning the core spec version. IDs unchanged.
- **v0.2.0 (2026-08-02)** — added §10 Evaluation (REQ-CORE-070/071) and
  REQ-CLI-009, promoting the retired prelim harness's metric and run-record
  capability into core.
- SPEC-APP-000 Appendix A should re-point its matrix rows from proposal steps
  to REQ-CORE and REQ-CLI IDs.
- When a command's behavior is tuned by the capstone evaluation, the change
  lands in its requirement file with a version bump here.
