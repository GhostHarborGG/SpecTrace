---
id: SPEC-CLI-000
title: SpecTrace CLI — Tool Specification
status: Draft
version: 0.1.0
owner: Brian Parker
created: 2026-08-01
derived-from: "CPSC 597 Proposal — SpecTrace: AI-Powered Requirements Traceability for Markdown-Based Specifications (July 2026)"
related: spectrace-product-spec.md (SPEC-APP-000)
---

# SpecTrace CLI — Tool Specification

This document specifies the SpecTrace command-line tool: the CPSC 597 capstone deliverable and the proof of concept for the SpecTrace analysis engine. It restates the proposal's design as testable contracts. Requirements use two ID families:

- **REQ-CORE-xxx** — engine behavior, owned by what will become `@spectrace/core`. These sections will be extracted verbatim into `spectrace-core-spec.md` when the package split happens; downstream documents (including SPEC-APP-000) should trace against these IDs.
- **REQ-CLI-xxx** — the command-line surface: commands, flags, output formats, exit codes. These stay in this document permanently.

Where the proposal defines an evaluation procedure rather than tool behavior (datasets, metrics, RQ mapping), this spec references it but does not restate it; the proposal remains authoritative for methodology.

## 1. Purpose and scope

SpecTrace establishes and maintains bidirectional trace links between Markdown specification documents and TypeScript/JavaScript source code, and detects when linked artifacts drift out of agreement. It operates locally, sends only bounded candidate sets to a language model, and accepts no link without human confirmation.

**In scope:** requirement schema and templates; repository indexing; lexical, semantic, and hybrid candidate retrieval; LLM-assisted ranking; human review; frontmatter + index storage; bidirectional navigation and coverage; git-aware incremental drift detection; provenance and cost accounting; human-readable and JSON output.

**Out of scope (per proposal):** automatic source-code modification; runtime behavior tracing; analysis of binaries or minified code; languages beyond TypeScript/JavaScript (a second language may be attempted as an unevaluated experiment); any GUI (see SPEC-APP-000); multi-user coordination.

## 2. Definitions

- **Requirement document** — a Markdown file conforming to the SpecTrace schema (§3).
- **Symbol** — an indexed code unit: file, class, method, function, or exported module, with a stable symbol identifier.
- **Candidate** — a symbol retrieved for a requirement prior to ranking.
- **Proposal** — a model- or retrieval-generated suggested link (candidate + classification + confidence + rationale) awaiting review.
- **Accepted link** — a proposal confirmed by a human reviewer; the only kind of link SpecTrace stores as truth.
- **Drift warning** — a detected inconsistency between a requirement and its linked code, in categories D1–D5 (§9).
- **Provenance record** — the tuple (repository commit SHA, tool configuration, model snapshot, prompt version, confidence bands, core version) attached to generated results.

## 3. Requirement schema (REQ-CORE-001 … 004)

---
**REQ-CORE-001 — Schema fields**
- **Priority:** P0 · **Status:** Proposed
- **Rationale:** Proposal Step 2: a requirement that cannot be identified and verified cannot be traced.
- **Requirement:** A requirement document shall carry, in YAML frontmatter: a unique identifier, title, rationale, status, priority, and a (possibly empty) set of trace links; and shall contain at least one verifiable acceptance criterion in its body or frontmatter.
- **Acceptance criteria:**
  - AC1: A document missing any mandatory field fails validation with a message naming the field and file.
  - AC2: Trace links serialize as an array of `{symbol, reviewer, timestamp, commit}` entries readable without SpecTrace installed.
  - AC3: Identifiers are treated as opaque and stable; renaming a file does not change its requirement ID.

---
**REQ-CORE-002 — Validation rules**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** Validation shall reject duplicate identifiers across the specification set and requirements lacking at least one acceptance criterion, and shall report all violations in a single pass rather than failing on the first.
- **Acceptance criteria:**
  - AC1: Two files sharing an ID are both reported, each naming the other.
  - AC2: Validation of the controlled repository's specification set completes in under 2 s.

---
**REQ-CORE-003 — Specification templates**
- **Priority:** P1 · **Status:** Proposed
- **Requirement:** The tool shall provide schema-valid templates for: use cases, functional requirements, non-functional requirements, architecturally significant requirements, and acceptance criteria.
- **Acceptance criteria:**
  - AC1: Each template instantiates with a generated unique ID and passes validation unedited.

---
**REQ-CORE-004 — Configuration file**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** Per-repository configuration shall live in `.spectrace/config` (format: YAML or JSON, one chosen and versioned), covering: specification paths, exclusion patterns (§4), retrieval mode and candidate count (§5), model and embedding settings (§6), and confidence bands (§7). All configuration is explicit; the engine shall read no environment variables directly.
- **Acceptance criteria:**
  - AC1: A missing config produces defaults plus a warning, not a failure.
  - AC2: An unknown config key produces a warning naming the key.

## 4. Repository indexing (REQ-CORE-010 … 012)

---
**REQ-CORE-010 — Symbol extraction**
- **Priority:** P0 · **Status:** Implemented
- **Rationale:** Proposal Step 3: symbol-level granularity via the TypeScript Compiler API.
- **Requirement:** The indexer shall extract files, classes, methods, functions, and exported modules from TypeScript and JavaScript sources using the TypeScript Compiler API, recording for each: a stable symbol identifier, file path, signature, and any attached documentation comments.
- **Acceptance criteria:**
  - AC1: Re-indexing an unchanged repository yields identical symbol identifiers.
  - AC2: A symbol's identifier survives edits to its body (identity is declaration-based, not content-based).
  - AC3: Index of the controlled repository completes in under 60 s on the evaluation baseline machine.

---
**REQ-CORE-011 — Exclusions**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** The indexer shall honor gitignore-style exclusion patterns from configuration for generated, vendored, and minified paths; excluded files shall contribute no symbols and no retrieval text.
- **Acceptance criteria:**
  - AC1: Adding an exclusion pattern and re-indexing removes the affected symbols and any proposals referencing them are flagged stale.

---
**REQ-CORE-012 — Local index artifact**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** The index shall be persisted locally in a documented format and shall be fully rebuildable from the specifications and repository content alone (no information exists only in the index).
- **Acceptance criteria:**
  - AC1: Delete index → rebuild at same commit → byte-identical index.

## 5. Candidate retrieval (REQ-CORE-020 … 023)

---
**REQ-CORE-020 — Lexical retrieval (Configuration A)**
- **Priority:** P0 · **Status:** Implemented
- **Rationale:** Proposal Step 3: the lexical baseline must be measurable without any model access.
- **Requirement:** For each requirement, the engine shall rank symbols by BM25 over symbol names, signatures, documentation, comments, and normalized source text, returning the top-k candidates (k from configuration); this mode shall require no network access of any kind.
- **Acceptance criteria:**
  - AC1: With all API settings absent, retrieval completes and emits Recall@k-measurable output.
  - AC2: Retrieval cost is independent of repository size beyond index lookup (no per-run full-text rescans).

---
**REQ-CORE-021 — Semantic retrieval (Configuration B)**
- **Priority:** P1 · **Status:** Proposed
- **Requirement:** When embeddings are enabled in configuration, the engine shall retrieve candidates by embedding similarity between requirement text and symbol text, using a configured embedding model; embedding vectors shall be cached and invalidated per symbol on content change.
- **Acceptance criteria:**
  - AC1: Second run at the same commit performs zero embedding API calls.

---
**REQ-CORE-022 — Hybrid retrieval (Configuration C)**
- **Priority:** P1 · **Status:** Proposed
- **Requirement:** Hybrid mode shall merge lexical and semantic rankings into a single candidate list (merge strategy documented and versioned) prior to LLM ranking.
- **Acceptance criteria:**
  - AC1: Configurations A, B, and C are selectable purely by configuration; the evaluation harness can run all three against the same index.

---
**REQ-CORE-023 — Bounded candidate sets**
- **Priority:** P0 · **Status:** Proposed
- **Rationale:** The proposal's central architectural decision: cost proportional to requirements, not repository size; operation beyond a single context window.
- **Requirement:** Only the requirement text and its top-k candidates shall ever be transmitted to a model; no operation shall transmit repository content outside the candidate set.
- **Acceptance criteria:**
  - AC1: A run's transmitted-content log contains exactly (requirements × ≤k) candidate excerpts and nothing else.

## 6. LLM ranking (REQ-CORE-030 … 032)

---
**REQ-CORE-030 — Proposal generation**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** For each candidate submitted, the model response shall be parsed into: a trace classification, a confidence score in [0,1], and a brief rationale; the prompt shall carry a version identifier recorded in provenance.
- **Acceptance criteria:**
  - AC1: Every stored proposal has all three fields populated.
  - AC2: Changing the prompt bumps the prompt version in all subsequent provenance records.

---
**REQ-CORE-031 — Malformed-response handling**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** A response failing schema validation shall be recorded as a failure with its provenance and raw payload reference, excluded from proposals, and tallied separately for evaluation reporting; malformed responses shall never crash a run.
- **Acceptance criteria:**
  - AC1: An injected malformed response yields a failure record, a nonzero failure count in run output, and an otherwise-completed run.

---
**REQ-CORE-032 — Usage accounting**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** Every model and embedding call shall record input tokens, output tokens, and estimated cost; per-run and per-requirement totals shall be reported.
- **Acceptance criteria:**
  - AC1: Run summary totals equal the sum of per-call records.

## 7. Human review and thresholds (REQ-CORE-040 … 042)

---
**REQ-CORE-040 — Review decisions**
- **Priority:** P0 · **Status:** Proposed
- **Rationale:** Proposal Step 4: a proposed link becomes an accepted link only after developer confirmation.
- **Requirement:** The engine shall support accept, reject, and redirect (re-targeting a proposal to a different symbol) on any proposal; no path shall create an accepted link without an explicit human decision; every decision shall record reviewer identity, timestamp, and repository commit.
- **Acceptance criteria:**
  - AC1: Grep of the codebase finds no call path from proposal generation to link storage that bypasses a decision record.
  - AC2: Decision records are exportable as JSON.

---
**REQ-CORE-041 — Confidence bands**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** Proposals shall be bucketed by confidence: above the suggest threshold (default 0.75) presented as suggested links; between review thresholds (default 0.50–0.74) queued for review; below the discard threshold (default 0.50) withheld but retained and inspectable. Thresholds are configurable; active values are recorded in provenance; threshold changes re-bucket only unreviewed proposals and never alter past decisions.
- **Acceptance criteria:**
  - AC1: Defaults match the proposal's provisional policy; tuned values ship as new defaults with the evaluation report.
  - AC2: Reviewer decision and model confidence are stored independently (override-rate measurable).

---
**REQ-CORE-042 — Decision audit separation**
- **Priority:** P1 · **Status:** Proposed
- **Requirement:** The audit trail (decisions, failures, provenance) shall be append-only in normal operation and stored distinctly from link state, so that override rates and review effort can be computed without reconstructing history.
- **Acceptance criteria:**
  - AC1: Accepting then rejecting the same proposal yields two audit entries and one final link state.

## 8. Link storage and navigation (REQ-CORE-050 … 052)

---
**REQ-CORE-050 — Dual storage**
- **Priority:** P0 · **Status:** Proposed
- **Rationale:** Proposal Step 5: human-readable frontmatter for people and tools without SpecTrace; generated index for the machine.
- **Requirement:** Accepted links shall be written to the requirement's frontmatter and to the generated index at `.spectrace/index.json`, which maps requirement IDs → symbol IDs and symbol IDs → requirement IDs; the index shall be rebuildable from specifications plus repository.
- **Acceptance criteria:**
  - AC1: Frontmatter and index never disagree after any single operation (transactional write or ordered write + repair).
  - AC2: Rebuild from frontmatter alone reproduces the bidirectional index exactly.

---
**REQ-CORE-051 — Bidirectional queries**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** The engine shall answer: code units linked to a requirement; requirements linked to a symbol; requirements with no accepted links; and coverage summary (counts by link state).
- **Acceptance criteria:**
  - AC1: Symbol→requirements lookup at controlled-repo scale returns in under 500 ms.
  - AC2: Coverage totals reconcile with per-requirement states exactly.

---
**REQ-CORE-052 — Stale link resolution**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** A link whose symbol no longer resolves at the current commit shall be reported as broken (feeding D1/D2 classification), never silently dropped.
- **Acceptance criteria:**
  - AC1: Deleting a linked symbol and re-indexing leaves the link present and flagged, with its last-resolved commit recorded.

## 9. Drift detection (REQ-CORE-060 … 063)

---
**REQ-CORE-060 — Git-aware incremental scoping**
- **Priority:** P0 · **Status:** Proposed
- **Rationale:** Proposal Step 6 and RQ4: re-evaluate only links affected by a change.
- **Requirement:** Given two commits, the engine shall compute the set of links whose linked symbols or requirement documents were affected by the intervening changes, and re-evaluate only that set; a full re-analysis mode shall also be invokable, with both modes reporting links evaluated, runtime, and token usage.
- **Acceptance criteria:**
  - AC1: A commit touching one linked symbol re-evaluates only links to that symbol.
  - AC2: Incremental and full analysis at the same commit pair reach consistent conclusions on the shared link set.

---
**REQ-CORE-061 — Drift categories**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** The engine shall classify drift as: **D1** linked symbol deleted; **D2** linked symbol suspected renamed; **D3** requirement changed while linked code unchanged; **D4** linked code changed in possible contradiction of its requirement; **D5** requirement with no implementation. D1/D2 shall be determined by symbol resolution with no model call; D3/D4 shall use semantic judgment via the bounded-candidate model path.
- **Acceptance criteria:**
  - AC1: Each injected scenario D1–D5 (proposal Evaluation Plan) is detected as its expected category on the controlled repository.
  - AC2: A run with no model access still reports D1, D2, and D5.

---
**REQ-CORE-062 — Warning content**
- **Priority:** P0 · **Status:** Proposed
- **Requirement:** Every drift warning shall identify the changed artifacts, the suspected inconsistency, a confidence value, a rationale, and the implicated commits, and shall be confirmable or dismissible with an audit record; dismissal applies to that link+commit pair only.
- **Acceptance criteria:**
  - AC1: A dismissed warning does not reappear at the same commit pair; a new commit affecting the link re-evaluates.

---
**REQ-CORE-063 — Provenance on results**
- **Priority:** P0 · **Status:** Proposed
- **Rationale:** Proposal Evaluation Plan: every reported result carries the commit, configuration, model snapshot, and prompt version that produced it.
- **Requirement:** Every proposal, drift warning, and report shall embed a provenance record (§2); results produced under different provenance shall be stored as distinct result sets and diffed, not overwritten.
- **Acceptance criteria:**
  - AC1: Re-running under a different model snapshot yields a second result set and a machine-readable diff against the first.

## 10. Command-line surface (REQ-CLI-001 … 008)

All commands: `--json` for machine-readable output on stdout (stable, versioned schemas shared with SPEC-APP-000); human-readable output otherwise; diagnostics on stderr; exit code 0 success, 1 operational failure, 2 usage error, 3 validation failure. This section is permanent CLI territory and will not move to the core spec.

---
**REQ-CLI-001 — `spectrace init`** — Scaffold `.spectrace/` (config with defaults, templates directory) in the current repository; idempotent; never overwrites without `--force`.

**REQ-CLI-002 — `spectrace validate`** — Run schema validation (REQ-CORE-001/002) over configured specification paths; `--json` emits the violation list; exit 3 on violations.

**REQ-CLI-003 — `spectrace index`** — Build or update the local symbol index (REQ-CORE-010…012); `--rebuild` forces from scratch; prints symbol counts by kind.

**REQ-CLI-004 — `spectrace analyze`** — Run retrieval and, per configuration, LLM ranking (REQ-CORE-020…032) over all or selected (`--req <id>`) requirements; prints/emits proposals with confidence bands, failures, and usage totals; `--dry-run` reports what would be transmitted and estimated cost without calling any model.

**REQ-CLI-005 — `spectrace review`** — Interactive terminal loop over queued proposals: accept / reject / redirect / skip, with source preview; `--reviewer <name>` required or taken from git config; non-interactive `--decide <file>` applies a JSON decision batch (REQ-CORE-040).

**REQ-CLI-006 — `spectrace links`** — Navigation queries (REQ-CORE-051): `--req <id>` lists linked symbols; `--symbol <id>` lists linked requirements; `--unlinked` lists requirements with no accepted links.

**REQ-CLI-007 — `spectrace coverage`** — Coverage summary and per-requirement states; `--json` output is the contract consumed by Studio's dashboard (SPEC-APP-000 REQ-APP-020 AC1).

**REQ-CLI-008 — `spectrace drift <fromRef> <toRef>`** — Run drift analysis (REQ-CORE-060…063); `--full` disables incremental scoping; `--confirm <warningId>` / `--dismiss <warningId>` record dispositions; prints warnings grouped by category D1–D5.

- **Acceptance criteria (surface-wide):**
  - AC1: Every command's `--json` output validates against its published schema; schemas carry version fields.
  - AC2: `analyze --dry-run` performs zero model/embedding calls.
  - AC3: All commands run non-interactively in CI except `review` without `--decide`.

## 11. Non-functional requirements

**NFR-CORE-001 — Locality.** All state lives in the repository (`.spectrace/`, frontmatter) or rebuildable caches; the tool functions with no network access in Configuration A end-to-end (validate, index, retrieve, links, coverage, D1/D2/D5 drift). *(P0)*

**NFR-CORE-002 — Determinism boundaries.** All non-model stages are deterministic at a fixed commit and configuration; model nondeterminism is contained to proposal/warning content and is characterized, per the proposal, by repeated runs recorded under identical provenance. *(P0)*

**NFR-CORE-003 — Cost proportionality.** Model cost scales with requirement count and k, not repository size; measured cost per requirement is reported by the evaluation and echoed in `--dry-run` estimates. *(P0)*

**NFR-CORE-004 — Performance.** Controlled-repository targets: full index < 60 s; retrieval per requirement < 1 s (lexical); incremental drift scoping < 5 s per commit pair, excluding model latency. Targets to be revised against feasibility-experiment measurements. *(P1)*

**NFR-CLI-001 — Scriptability.** JSON mode is side-effect-equivalent to human mode; no command requires a TTY except interactive `review`. *(P0)*

**NFR-CORE-005 — Privacy of transmitted content.** Only requirement text and candidate excerpts are transmitted (REQ-CORE-023); a `--show-payloads` flag reveals exactly what would be or was sent. *(P0)*

## 12. Traceability to the proposal

| Proposal element | Spec section |
|---|---|
| Step 2 — schema, validation, templates | §3 (REQ-CORE-001…003) |
| Step 3 — indexing, exclusions, retrieval, bounded candidates | §4–§5 (REQ-CORE-010…023) |
| Step 4 — LLM ranking, malformed handling, human review | §6–§7 (REQ-CORE-030…042) |
| Step 5 — dual storage, navigation, JSON/CI output | §8, §10 (REQ-CORE-050…052, REQ-CLI-006/007) |
| Step 6 — git-aware drift, four categories + D5, warning content | §9 (REQ-CORE-060…063) |
| Evaluation Plan — configurations A/B/C | §5 (REQ-CORE-020…022) |
| Evaluation Plan — thresholds and override measurement | §7 (REQ-CORE-041) |
| Evaluation Plan — provenance of every result | §9 (REQ-CORE-063) |
| Resources — cost accounting | §6 (REQ-CORE-032), NFR-CORE-003 |
| Scope — no code modification, TS/JS only, no runtime tracing | §1 |

Evaluation methodology (datasets, metrics, drift injection procedure, RQ1–RQ4) is intentionally not restated here; the proposal and the eventual evaluation report are authoritative for it. This spec defines the tool those procedures measure.

## 13. Document evolution

- On extraction of `@spectrace/core`, sections 3–9 and the NFR-CORE items move to `spectrace-core-spec.md` with IDs unchanged; this document retains §10 and NFR-CLI items and gains a dependency header pinning a core spec version.
- SPEC-APP-000 Appendix A should re-point its matrix rows from proposal steps to REQ-CORE IDs once this document is baselined.
- Threshold defaults, performance targets, and the recommended default configuration are updated in place when the capstone evaluation reports tuned values, with version bumps.
