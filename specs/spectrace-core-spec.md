---
id: SPEC-CORE-000
title: SpecTrace Core — Engine Specification
status: Draft
version: 0.1.0
owner: Brian Parker
created: 2026-08-02
derived-from: "spectrace-cli-spec.md (SPEC-CLI-000) v0.2.0 §§3–10, NFR-CORE items — extracted at the Phase B schema freeze per that document's §14"
related: spectrace-cli-spec.md (SPEC-CLI-000), spectrace-product-spec.md (SPEC-APP-000)
---

# SpecTrace Core — Engine Specification

This document specifies the SpecTrace analysis engine — the behavior owned by
`@spectrace/core`. It is the contract both clients trace against: the CLI
(SPEC-CLI-000) and Studio (SPEC-APP-000) are thin surfaces over what is
specified here, and neither may bypass it.

**Requirement bodies live in `specs/requirements/`, one file per requirement.**
This document carries the narrative — what each group of requirements is for,
how the pieces relate, and what stays out of scope. The requirement statements
and their acceptance criteria are authoritative in the individual files;
section tables below index them. Requirement IDs are opaque and stable
(REQ-CORE-001 AC3): moving a requirement between documents or renaming its
file never changes its ID.

Where the proposal defines an evaluation *procedure* rather than tool behavior
(datasets, metrics interpretation, RQ mapping), this spec references it but
does not restate it; the proposal remains authoritative for methodology.

## 1. Purpose and scope

The engine establishes and maintains bidirectional trace links between
Markdown specification documents and TypeScript/JavaScript source code, and
detects when linked artifacts drift out of agreement. It operates locally,
sends only bounded candidate sets to a language model, and accepts no link
without human confirmation.

**In scope:** requirement schema and validation; templates; configuration;
repository indexing and exclusions; lexical, semantic, and hybrid candidate
retrieval; LLM-assisted ranking; human review and confidence bands;
frontmatter + index storage; bidirectional navigation and coverage; git-aware
incremental drift detection; provenance, usage accounting, and evaluation
metrics.

**Out of scope:** automatic source-code modification; runtime behavior
tracing; analysis of binaries or minified code; languages beyond
TypeScript/JavaScript (a second language may be attempted as an unevaluated
experiment); any user interface, terminal or graphical — those belong to
SPEC-CLI-000 and SPEC-APP-000; multi-user coordination.

**Engine constraints that bind every requirement below.** These are hard
architectural rules, not preferences, and they are restated in `CLAUDE.md`:
the engine writes no console output, reads no environment variables, and never
calls `process.exit` — configuration arrives explicitly and progress leaves
through injected callbacks. Every value returned from a public API survives
`structuredClone`, because Studio moves those values across an Electron IPC
boundary. All file paths inside stored artifacts and all symbol identifiers
are POSIX-normalized; conversion happens at the filesystem boundary only.

## 2. Definitions

- **Requirement document** — a Markdown file conforming to the SpecTrace
  schema (§3).
- **Symbol** — an indexed code unit: file, class, method, function, or
  exported module, with a stable symbol identifier.
- **Candidate** — a symbol retrieved for a requirement prior to ranking.
- **Proposal** — a model- or retrieval-generated suggested link (candidate +
  classification + confidence + rationale) awaiting review.
- **Accepted link** — a proposal confirmed by a human reviewer; the only kind
  of link SpecTrace stores as truth.
- **Drift warning** — a detected inconsistency between a requirement and its
  linked code, in categories D1–D5 (§9).
- **Provenance record** — the tuple (repository commit SHA, tool
  configuration, model snapshot, prompt version, confidence bands, core
  version) attached to generated results.

## 3. Requirement schema

A requirement that cannot be identified and verified cannot be traced, so the
schema is deliberately small: enough structure to make identity stable and
verification possible, and nothing that a human editing Markdown by hand would
resent. Trace links are stored in frontmatter in a form readable without
SpecTrace installed (REQ-CORE-050) — the schema is the human-facing half of
that contract.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-001](requirements/REQ-CORE-001.md) | Schema fields | P0 | Proposed |
| [REQ-CORE-002](requirements/REQ-CORE-002.md) | Validation rules | P0 | Proposed |
| [REQ-CORE-003](requirements/REQ-CORE-003.md) | Specification templates | P1 | Proposed |
| [REQ-CORE-004](requirements/REQ-CORE-004.md) | Configuration file | P0 | Proposed |

**Mandatory fields are `id`, `title`, and `status`**; `priority` (default
`P1`), `rationale`, and `links` (default empty) are optional, and a rationale
may live in a `## Rationale` body section instead of frontmatter. This is
looser than the original wording, amended 2026-08-02 (BP) so the frozen
feasibility corpus validates without being re-frozen — see REQ-CORE-001's
notes for the reasoning.

**Configuration is YAML**, at `.spectrace/config.yaml`, carrying a `version`
field (decided 2026-08-02, BP; the original wording left YAML-or-JSON open).

**Status vocabulary** — `proposed` (no acceptance criterion holds yet),
`partial` (at least one holds, not all), `implemented` (all hold, each covered
by a test). `partial` is new as of 2026-08-02 and is **pending BP
ratification**: the build plan's definition of done describes a
`Proposed → Implemented` flip only, but three requirements are genuinely
mid-flight (REQ-CORE-011, REQ-CLI-003, and the subset behind REQ-CLI-004), and
recording them as `proposed` is the silent spec/code divergence the risk
register warns about. Reject it and they revert to `proposed` with their notes
carrying the detail.

## 4. Repository indexing

Indexing is symbol-level rather than file-level because a requirement is
usually implemented by a method, not by a whole file, and because drift
detection needs to know when *that* declaration changed. Identity is
declaration-based, not content-based: a symbol keeps its ID across edits to its
body, which is what makes a stored link survive ordinary development.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-010](requirements/REQ-CORE-010.md) | Symbol extraction | P0 | Implemented |
| [REQ-CORE-011](requirements/REQ-CORE-011.md) | Exclusions | P0 | Partial |
| [REQ-CORE-012](requirements/REQ-CORE-012.md) | Local index artifact | P0 | Proposed |

**Phase C candidate (needs a REQ-CORE-010 spec change first, BP to approve):**
attach co-located Markdown documentation sections — README API headings — to
their symbols' documentation field. This came out of the Phase A error
analysis. On the `hookable` fixture it must be reported as a separate
configuration line with a validity caveat, because that fixture's requirements
were authored from the README the change would index.

## 5. Candidate retrieval

Retrieval is the load-bearing half of the architecture's central bet: if the
top-k candidates for a requirement reliably contain its real implementation,
then every downstream model call can be bounded to those candidates, and cost
scales with the number of requirements rather than the size of the repository.
Three configurations exist so the bet can be measured — lexical alone,
semantic alone, and hybrid — selectable purely by configuration against the
same index.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-020](requirements/REQ-CORE-020.md) | Lexical retrieval (Configuration A) | P0 | Implemented |
| [REQ-CORE-021](requirements/REQ-CORE-021.md) | Semantic retrieval (Configuration B) | P1 | Proposed |
| [REQ-CORE-022](requirements/REQ-CORE-022.md) | Hybrid retrieval (Configuration C) | P1 | Proposed |
| [REQ-CORE-023](requirements/REQ-CORE-023.md) | Bounded candidate sets | P0 | Proposed |

**Lexical scoring is versioned.** `bm25f-v5` is the default as of the Phase A
gate closure (2026-08-02): overall Recall@5 .750, Hit@5 91.7%, Hit@10 100%,
MRR .515 on the frozen `hookable` corpus, independently reproduced by BP.
Identifiers `bm25f-v6` (source-term saturation) and `bm25f-v7` (near-tie
diversity rerank) are burned — both regressed and were reverted, and their
patches and run artifacts are retained as negative results for the evaluation
report. The measured-version cap that stopped that optimization loop is
methodology, recorded in `docs/feasibility-error-analysis.md`, not a
requirement.

## 6. LLM ranking

The model's job is narrow by design: given a requirement and a bounded
candidate set, classify and score, with a rationale a reviewer can read. It
never sees the repository, never writes a link, and its failures are recorded
rather than raised — a malformed response degrades a run's yield, not its
completion.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-030](requirements/REQ-CORE-030.md) | Proposal generation | P0 | Proposed |
| [REQ-CORE-031](requirements/REQ-CORE-031.md) | Malformed-response handling | P0 | Proposed |
| [REQ-CORE-032](requirements/REQ-CORE-032.md) | Usage accounting | P0 | Proposed |

Deferred to Phase D by the 2026-08-02 descope (BP). The feasibility
experiment's classification-accuracy question (prelim PQ3) and the token,
latency, and cost portion of PQ4 are discharged when these land, measured
against the frozen experiment repository.

## 7. Human review and thresholds

No path creates an accepted link without an explicit human decision — this is
the product's core claim and the reason review is specified as engine behavior
rather than as a UI concern. Confidence bands exist to triage reviewer
attention, not to automate it: even a high-confidence proposal is a
suggestion. Reviewer decisions and model confidence are stored independently
so that override rate is measurable, which is what turns review into
evaluation data.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-040](requirements/REQ-CORE-040.md) | Review decisions | P0 | Proposed |
| [REQ-CORE-041](requirements/REQ-CORE-041.md) | Confidence bands | P0 | Proposed |
| [REQ-CORE-042](requirements/REQ-CORE-042.md) | Decision audit separation | P1 | Proposed |

Threshold defaults are provisional (suggest 0.75, review 0.50–0.74, discard
below 0.50). Values tuned by the capstone evaluation ship as the new defaults
with a version bump, per §13.

## 8. Link storage and navigation

Links are written twice on purpose: to the requirement's frontmatter, where a
person or a tool without SpecTrace can read them, and to a generated index
that answers queries in both directions. The frontmatter is the source of
truth — the index must be reconstructible from it — which keeps the
human-readable copy from decaying into a stale mirror of a binary artifact.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-050](requirements/REQ-CORE-050.md) | Dual storage | P0 | Proposed |
| [REQ-CORE-051](requirements/REQ-CORE-051.md) | Bidirectional queries | P0 | Proposed |
| [REQ-CORE-052](requirements/REQ-CORE-052.md) | Stale link resolution | P0 | Proposed |

## 9. Drift detection

Drift is what a traceability tool is *for* after the first link is accepted.
Five categories are recognized: **D1** linked symbol deleted; **D2** linked
symbol suspected renamed; **D3** requirement changed while linked code
unchanged; **D4** linked code changed in possible contradiction of its
requirement; **D5** requirement with no implementation. D1, D2, and D5 fall
out of symbol resolution and need no model access at all — a deliberate split,
since it means the offline half of the tool still detects the most common
failure.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-060](requirements/REQ-CORE-060.md) | Git-aware incremental scoping | P0 | Proposed |
| [REQ-CORE-061](requirements/REQ-CORE-061.md) | Drift categories | P0 | Proposed |
| [REQ-CORE-062](requirements/REQ-CORE-062.md) | Warning content | P0 | Proposed |
| [REQ-CORE-063](requirements/REQ-CORE-063.md) | Provenance on results | P0 | Proposed |

Landing in Phase F, which also discharges the controlled drift scenarios
(prelim PQ5) deferred from Phase A.

## 10. Evaluation

Metric computation is product capability, not harness code, so that the
experiments measure the shipped engine. This section defines computation only
— datasets, labeling procedure, and research questions remain with the
proposal and the prelim spec.

| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-CORE-070](requirements/REQ-CORE-070.md) | Retrieval evaluation metrics | P0 | Implemented |
| [REQ-CORE-071](requirements/REQ-CORE-071.md) | Run artifacts | P0 | Implemented |

These were promoted out of the retired `@spectrace/prelim` harness (prelim
spec §10, §15) on 2026-08-02.

## 11. Non-functional requirements

NFR items stay in this narrative document rather than becoming requirement
files: they are engine-wide properties without their own acceptance criteria,
and REQ-CORE-002 rejects any requirement document lacking one. Revisit if a
future NFR acquires testable criteria of its own.

**NFR-CORE-001 — Locality.** All state lives in the repository
(`.spectrace/`, frontmatter) or rebuildable caches; the tool functions with no
network access in Configuration A end-to-end (validate, index, retrieve,
links, coverage, D1/D2/D5 drift). *(P0)*

**NFR-CORE-002 — Determinism boundaries.** All non-model stages are
deterministic at a fixed commit and configuration; model nondeterminism is
contained to proposal and warning content and is characterized, per the
proposal, by repeated runs recorded under identical provenance. *(P0)*

**NFR-CORE-003 — Cost proportionality.** Model cost scales with requirement
count and k, not repository size; measured cost per requirement is reported by
the evaluation and echoed in dry-run estimates. *(P0)*

**NFR-CORE-004 — Performance.** Controlled-repository targets: full index
< 60 s; retrieval per requirement < 1 s (lexical); incremental drift scoping
< 5 s per commit pair, excluding model latency. Targets to be revised against
feasibility-experiment measurements. *(P1)*

**NFR-CORE-005 — Privacy of transmitted content.** Only requirement text and
candidate excerpts are transmitted (REQ-CORE-023); clients shall be able to
reveal exactly what would be or was sent. *(P0)*

## 12. Traceability to the proposal

| Proposal element | Requirements |
|---|---|
| Step 2 — schema, validation, templates | REQ-CORE-001…003 |
| Step 3 — indexing, exclusions, retrieval, bounded candidates | REQ-CORE-010…023 |
| Step 4 — LLM ranking, malformed handling, human review | REQ-CORE-030…042 |
| Step 5 — dual storage, navigation | REQ-CORE-050…052 |
| Step 6 — git-aware drift, four categories + D5, warning content | REQ-CORE-060…063 |
| Evaluation Plan — configurations A/B/C | REQ-CORE-020…022 |
| Evaluation Plan — thresholds and override measurement | REQ-CORE-041 |
| Evaluation Plan — provenance of every result | REQ-CORE-063 |
| Evaluation Plan — retrieval metrics and run records | REQ-CORE-070/071 |
| Resources — cost accounting | REQ-CORE-032, NFR-CORE-003 |
| Scope — no code modification, TS/JS only, no runtime tracing | §1 |

CLI-surface traceability (JSON output, command mapping) stays in
SPEC-CLI-000.

## 13. Document evolution

- This document was extracted from SPEC-CLI-000 v0.2.0 at the Phase B schema
  freeze, as that document's §14 directed. IDs are unchanged; requirement
  bodies moved to `specs/requirements/` in the same operation.
- Threshold defaults, performance targets, and the recommended default
  configuration are updated in place when the capstone evaluation reports
  tuned values, with a version bump here and in the affected requirement
  files.
- SPEC-APP-000 Appendix A should re-point its matrix rows from proposal steps
  to REQ-CORE IDs.
- Clients pin a version of this document: SPEC-CLI-000 carries a dependency
  header, and Studio pins a `@spectrace/core` version under NFR-APP-007.
