---
id: SPEC-APP-000
title: SpecTrace Studio — Product Specification
status: Draft
version: 0.3.0
owner: Brian Parker (Ghost Harbor LLC)
created: 2026-08-01
depends-on: "@spectrace/core (CLI proof of concept, CPSC 597)"
---

# SpecTrace Studio — Product Specification

> **Working title.** "SpecTrace Studio" distinguishes the application from the SpecTrace CLI. Rename freely; requirement IDs are stable regardless.

## 1. Vision

SpecTrace Studio is a markdown knowledge base where specification documents are *live*. Teams write specs the way they would in Obsidian, Outline, or Confluence — wiki-links, backlinks, frontmatter, folders — but every requirement page also knows its relationship to the codebase: which symbols implement it, whether those links are still valid, and whether the code has drifted from what the requirement says.

The product answers two questions that no wiki answers today:

1. **Coverage** — "Which parts of our spec are actually implemented?"
2. **Drift** — "Which parts of our spec no longer match the code?"

The analysis capabilities are not speculative: they are the subject of the SpecTrace CLI (CPSC 597 capstone), which serves as the proof of concept and publishes evaluated accuracy, cost, and runtime characteristics. Studio consumes that engine; it does not reimplement it.

### 1.1 Positioning

| | Obsidian | Confluence | Requirements tools (Jama, DOORS) | **SpecTrace Studio** |
|---|---|---|---|---|
| Markdown-native, files on disk | ✅ | ❌ | ❌ | ✅ |
| Multi-user (eventual) | Limited | ✅ | ✅ | ✅ (R2) |
| Trace links to code symbols | ❌ | ❌ | Heavyweight | ✅ |
| Drift detection | ❌ | ❌ | ❌ | ✅ |
| Adoption cost | Low | Medium | High | Low |

The wedge: teams that already keep markdown docs in or beside their repo get traceability without changing where their documents live.

### 1.2 Target users

- **P1 — Solo developer / small studio lead** (rendition 1 primary persona): maintains specs and code alone or with 1–3 others; wants status visibility without process overhead.
- **P2 — Designer / PM on a small team** (rendition 2): reads and edits specs, does not read code; needs status badges and drift warnings translated into document terms.
- **P3 — Engineer on a small team** (rendition 2): lands in unfamiliar code; needs symbol → requirement navigation and a review queue for proposed links.

## 2. Product context and dependency model

### 2.1 Relationship to the SpecTrace CLI

The CLI (CPSC 597 deliverable) proves and packages the analysis engine. Studio's contract with it:

- The engine is consumed as a versioned library, **`@spectrace/core`**, extracted from the CLI codebase. The CLI and Studio are two clients of the same core. If extraction is impractical in rendition 1, Studio may shell out to the CLI binary and consume its JSON output — the CLI already commits to machine-readable output on every command — but the library path is the target state.
- Studio never bypasses the core's contracts: the requirement schema, `.spectrace/index.json` format, frontmatter link storage, confidence thresholds, and review semantics are owned by the core and versioned with it.
- Evaluated results from the capstone (retrieval recall, link precision/recall, drift confusion matrix, cost per requirement) are the product's published evidence base. Studio's marketing and defaults inherit them.

### 2.2 Source of truth

Plain markdown files in a git-backed vault are the single source of truth. The application state (indexes, caches, UI preferences) is always rebuildable from the vault plus the repository. This is a load-bearing decision:

- It preserves the Obsidian-style experience (files are portable, greppable, editable by other tools).
- It makes rendition 2 multi-user a *sync problem*, not a data-model migration.
- It means Studio can never hold documents hostage.

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────┐
│  SpecTrace Studio (desktop app, rendition 1)        │
│  ┌───────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │  Editor    │ │ Review Queue │ │ Status         │  │
│  │  (MD, wiki │ │ (accept /    │ │ Dashboard      │  │
│  │  links)    │ │ reject /     │ │ (coverage,     │  │
│  │            │ │ redirect)    │ │ drift)         │  │
│  └─────┬─────┘ └──────┬───────┘ └───────┬────────┘  │
│        └───────────────┼─────────────────┘           │
│                 ┌──────┴───────┐                     │
│                 │ @spectrace/  │  schema, indexer,   │
│                 │ core         │  retrieval, LLM     │
│                 └──────┬───────┘  ranking, drift     │
└────────────────────────┼────────────────────────────┘
          ┌──────────────┼──────────────┐
   ┌──────┴─────┐ ┌──────┴──────┐ ┌────┴─────────┐
   │ Vault      │ │ GitHub API  │ │ LLM API      │
   │ (markdown, │ │ (read-only) │ │ (bounded     │
   │ git)       │ │ + local     │ │ candidate    │
   │            │ │ cache       │ │ ranking)     │
   └────────────┘ └─────────────┘ └──────────────┘
```

### 3.1 Key architectural decisions

- **AD-1: Local-first desktop application for rendition 1.** Electron or Tauri shell over a TypeScript/React UI, matching the team's existing stack. Tauri is preferred pending a spike (AD-1a) for binary size and memory; Electron is the fallback with no spec impact.
- **AD-2: Vault model.** A Studio workspace is a directory of markdown files under git. Spec files may live inside the analyzed repository or in a sibling repository; both are supported.
- **AD-3: GitHub API, read-only.** Repository content is fetched via the GitHub REST/GraphQL API with a read-only token and mirrored into a local content cache keyed by commit SHA. All indexing and analysis run against the cache, never against live API responses, so analysis is reproducible and rate-limit-safe. Sync is on-demand and on a configurable schedule.
- **AD-4: No code modification.** Inherited from the CLI scope. Studio reads the repository; it never writes to it.
- **AD-5: LLM usage is bounded and visible.** Only requirement + candidate sets go to the model (the core's retrieval-first design). Studio surfaces token usage and estimated cost per analysis run in the UI.
- **AD-6: Multi-user is deferred, not foreclosed.** See §7. The rendition-1 data model must not make the git-merge vs. CRDT decision prematurely; anything that would (e.g., a proprietary binary document format, DB-only link storage) is prohibited.

## 4. Functional requirements

Requirements follow the SpecTrace schema: stable ID, rationale, acceptance
criteria, status, priority. Phrasing follows EARS where applicable.

**Requirement bodies live in `specs/requirements/`, one file per
requirement.** This document carries the narrative — what each group is for
and how the pieces relate. The tables below are **generated** from requirement
frontmatter by `pnpm spec:index` and CI fails if they have diverged; to
change a title, priority, or status, edit the requirement file. Trace links
are empty until implementation begins and will be populated by SpecTrace
itself.

### 4.1 Vault and editing

The vault is the unit of everything else: a local directory of markdown that
Studio opens, navigates, and edits with the ergonomics a spec author already
expects from Obsidian or Outline. Frontmatter is where the SpecTrace schema
lives, so the editor's job is to make schema compliance easy rather than
policed — templates that start valid, violations surfaced inline, trace links
rendered as navigable chips instead of raw YAML.

<!-- spectrace:begin REQ-APP-00 -->
| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-APP-001](requirements/REQ-APP-001.md) | Open and manage a vault | P0 | partial |
| [REQ-APP-002](requirements/REQ-APP-002.md) | Markdown editing with live preview | P0 | proposed |
| [REQ-APP-003](requirements/REQ-APP-003.md) | Wiki-links and backlinks | P0 | proposed |
| [REQ-APP-004](requirements/REQ-APP-004.md) | Frontmatter-aware requirement documents | P0 | proposed |
| [REQ-APP-005](requirements/REQ-APP-005.md) | Specification templates | P1 | proposed |
<!-- spectrace:end -->

### 4.2 Repository connection and analysis

This is the differentiator: a spec vault that knows about a codebase. The
connection is read-only by construction — a token carrying write scope is
refused outright — and the repository is mirrored into a cache keyed by commit
SHA so that analysis is reproducible and rate-limit-safe. Everything
downstream indexes the cache, never the API. Studio adds progress, cost
visibility, and cancellation on top of the engine's pipeline, but the results
must match an equivalent CLI invocation at the same core version.

<!-- spectrace:begin REQ-APP-01 -->
| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-APP-010](requirements/REQ-APP-010.md) | Connect a GitHub repository (read-only) | P0 | proposed |
| [REQ-APP-011](requirements/REQ-APP-011.md) | Repository sync and local cache | P0 | proposed |
| [REQ-APP-012](requirements/REQ-APP-012.md) | Run analysis (index, retrieve, rank) | P0 | proposed |
| [REQ-APP-013](requirements/REQ-APP-013.md) | Link review queue | P0 | proposed |
| [REQ-APP-014](requirements/REQ-APP-014.md) | Bidirectional navigation | P0 | proposed |
<!-- spectrace:end -->

### 4.3 Status: coverage and drift

Coverage and drift are the two halves of the question the product exists to
answer: what is the status of development? Coverage says which requirements
have implementations; drift says which of those implementations have since
stopped agreeing with the requirement. Both surface where the reader already
is — badges in the tree, banners on the document — rather than only in a
dashboard they have to remember to open.

<!-- spectrace:begin REQ-APP-02 -->
| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-APP-020](requirements/REQ-APP-020.md) | Coverage dashboard | P0 | proposed |
| [REQ-APP-021](requirements/REQ-APP-021.md) | Drift surfacing | P0 | proposed |
| [REQ-APP-022](requirements/REQ-APP-022.md) | Status reporting | P1 | proposed |
<!-- spectrace:end -->

### 4.4 Search

A knowledge base that cannot be searched across both halves — prose and symbol
metadata — leaves the reader guessing which half holds the answer.

<!-- spectrace:begin REQ-APP-03 -->
| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-APP-030](requirements/REQ-APP-030.md) | Unified search | P1 | proposed |
<!-- spectrace:end -->

### 4.5 Analysis configuration, provenance, and administration

These requirements close the gap between Studio and the full CLI capability
set: every configuration, safeguard, and record-keeping behavior in the
capstone proposal has a first-class surface in the application. Several are
Studio surfaces over settings the engine already owns — retrieval mode,
exclusion patterns, and confidence bands all live in `.spectrace/config.yaml`
(REQ-CORE-004), which Studio edits rather than shadowing with its own store.
See Appendix A for the full capability traceability matrix.

<!-- spectrace:begin REQ-APP-04 -->
| ID | Title | Priority | Status |
|---|---|---|---|
| [REQ-APP-040](requirements/REQ-APP-040.md) | Retrieval configuration (Configurations A/B/C) | P0 | proposed |
| [REQ-APP-041](requirements/REQ-APP-041.md) | Repository exclusion configuration | P1 | proposed |
| [REQ-APP-042](requirements/REQ-APP-042.md) | Confidence threshold configuration | P1 | proposed |
| [REQ-APP-043](requirements/REQ-APP-043.md) | Run provenance | P0 | proposed |
| [REQ-APP-044](requirements/REQ-APP-044.md) | Malformed-response and failure reporting | P1 | proposed |
| [REQ-APP-045](requirements/REQ-APP-045.md) | Index rebuild and full re-analysis | P1 | proposed |
<!-- spectrace:end -->


## 5. Non-functional requirements

---
**NFR-APP-001 — Offline capability.** All editing, navigation, coverage views, and previously computed drift warnings shall function with no network access. Only sync and LLM-dependent analysis require connectivity, and their unavailability shall degrade gracefully with clear messaging. *(P0)*

**NFR-APP-002 — Performance envelope.** Vault open < 2 s at 1,000 documents; editor keystroke latency < 16 ms at p95; full index rebuild of the controlled repository < 60 s on baseline hardware (defined as the capstone evaluation machine). *(P0)*

**NFR-APP-003 — Cost transparency and bounds.** Every LLM-consuming operation shall display estimated cost before execution and actual cost after; a per-vault monthly budget setting shall block runs that would exceed it. Defaults derive from the capstone's measured cost-per-requirement. *(P0)*

**NFR-APP-004 — Security.** Read-only repository access only (REQ-APP-010); tokens in OS keychain; no telemetry in rendition 1; LLM requests contain only requirement text and bounded candidate excerpts, and the settings UI shall state exactly what is transmitted. *(P0)*

**NFR-APP-005 — Data integrity.** The vault plus repository cache is sufficient to rebuild all application state; deleting Studio's app data and reopening the vault shall lose nothing but UI preferences and unsynced caches. *(P0)*

**NFR-APP-006 — Portability.** macOS and Windows at rendition 1; Linux tracked as P2. *(P1)*

**NFR-APP-007 — Core parity.** Studio shall pin a specific `@spectrace/core` version, display it in the UI, and produce analysis results identical to the CLI at that version (verified in CI against the labeled dataset). *(P0)*

## 6. Explicitly out of scope (rendition 1)

- Real-time collaborative editing and any server component (see §7).
- Writing to the connected repository in any form (AD-4).
- Languages beyond TypeScript/JavaScript analysis (inherits core scope; core language expansion flows through automatically).
- Issue-tracker integrations (Jira, Linear), CI status ingestion, and webhooks — candidates for rendition 2+.
- Mobile clients.
- Automatic acceptance of proposed links regardless of confidence.

## 7. Multi-user evolution (rendition 2 — deferred, protected)

Rendition 1 is single-user by design; multi-user is a product requirement, not an afterthought. The following is recorded now so rendition 1 cannot foreclose it:

- **Open decision OD-1: git-merge vs. CRDT sync.**
  - *Git-merge path:* the vault is already a git repo; multi-user = push/pull with merge assistance in the UI. Cheap, aligns with developer workflows, degrades to async collaboration. Weakness: designers/PMs (P2) don't want merge conflicts.
  - *CRDT path (e.g., Yjs over markdown):* true real-time co-editing, Confluence-grade UX. Weakness: server or relay infrastructure, and care to keep plain-file source of truth intact.
  - *Likely resolution:* git-merge as the rendition-2 baseline, CRDT as a rendition-3 layer for active co-editing sessions — but the decision is deferred until rendition-1 learnings exist.
- **Constraints on rendition 1 imposed by OD-1:** plain markdown + frontmatter as sole durable format (no proprietary document format); all link/decision records embedded in files or rebuildable indexes; per-decision audit records already carry reviewer identity (REQ-APP-013), so the data model is multi-user-ready even while the app is not.
- Authentication, roles (who may accept links?), and shared LLM budget accounting are rendition-2 spec work.

## 8. Assumptions and risks

| # | Assumption / Risk | Mitigation |
|---|---|---|
| A1 | The capstone validates retrieval-first accuracy and cost at useful levels. | Studio's schedule trails the capstone's evaluation milestones; go/no-go on LLM-dependent features keys off RQ1–RQ4 results. |
| A2 | `@spectrace/core` can be cleanly extracted from the CLI. | Fallback: shell out to the CLI's JSON interface (REQ-APP-012 parity still testable). |
| R1 | GitHub API rate limits on large repos. | SHA-keyed cache (REQ-APP-011); delta sync; documented repo-size envelope. |
| R2 | Editor quality bar (Obsidian parity) is expensive. | Build on a proven editor substrate (CodeMirror 6 / ProseMirror spike, AD-1a scope); do not hand-roll. |
| R3 | LLM nondeterminism confuses users re-running analysis. | Persist proposals per (core version, model snapshot, prompt version, SHA); re-runs diff against prior proposals rather than silently replacing them. |
| R4 | Solo-founder bandwidth alongside capstone and Ghost Harbor titles. | Rendition 1 P0 set is deliberately small; everything else is staged. |

## 9. Renditions and milestones

- **R0 — Engine extraction:** `@spectrace/core` split from CLI; parity test suite against the labeled dataset. *(Exit: NFR-APP-007 green in CI.)*
- **R1 — Single-user Studio (this document's P0 set):** vault + editor + wiki-links + frontmatter schema + GitHub sync + analysis + review queue + navigation + coverage + drift. *(Exit: all P0 acceptance criteria pass; dogfooded on SpecTrace's own repositories.)*
- **R1.1 — Reporting and search polish:** REQ-APP-022, REQ-APP-030, template UX.
- **R2 — Multi-user baseline:** OD-1 resolved; shared vault workflow; roles for link acceptance.
- **R3 — Collaboration layer:** real-time co-editing if OD-1 resolution demands it; integrations (CI status, issue trackers).

## 10. Glossary

- **Vault** — a git-backed directory of markdown documents opened by Studio.
- **Requirement document** — a vault document conforming to the SpecTrace schema (stable ID, rationale, acceptance criteria, status, priority, trace links).
- **Trace link** — a human-confirmed association between a requirement ID and a code symbol ID, stored in frontmatter and `.spectrace/index.json`.
- **Coverage** — the proportion and identity of requirements with accepted trace links.
- **Drift** — a detected inconsistency between a requirement and its linked code, in one of five categories (D1–D5).
- **Core** — `@spectrace/core`, the analysis engine proven by the SpecTrace CLI capstone.

## Document evolution

- **v0.3.0 (2026-08-02)** — REQ-APP-001…045 extracted to
  `specs/requirements/`, one file per requirement, matching the treatment
  REQ-CORE and REQ-CLI received at the Phase B schema freeze. IDs unchanged.
  §4's tables are now generated from requirement frontmatter by
  `pnpm spec:index`, so title, priority, and status have a single source of
  truth. The vault `spectrace validate` walks grew from 35 requirements to 55.
- NFR-APP items stay in this document rather than becoming requirement files:
  they are application-wide properties without their own acceptance criteria,
  and REQ-CORE-002 rejects a requirement document lacking one. Revisit if a
  future NFR acquires testable criteria of its own.
- Appendix A should re-point its matrix rows from proposal steps to REQ-CORE
  and REQ-CLI IDs, now that those documents exist.

## Appendix A — CLI capability traceability matrix

Every tool capability described in the CPSC 597 proposal, mapped to the Studio requirement(s) that expose it. This appendix is the completeness check for the "consumes the CLI" claim; a proposal capability with no Studio requirement is a spec defect.

| Proposal capability (source step) | Studio requirement(s) |
|---|---|
| Requirement schema: stable IDs, status, priority, acceptance criteria, trace-link metadata; validation rejects duplicate IDs and missing acceptance criteria (Step 2) | REQ-APP-004 |
| Specification templates: use cases, FRs, NFRs, ASRs, acceptance criteria (Step 2) | REQ-APP-005 |
| Repository indexing at file/class/method/function granularity via TS Compiler API; stable symbol IDs (Step 3) | REQ-APP-011, REQ-APP-012 |
| Exclusion configuration for generated/vendored/minified paths (Step 3) | REQ-APP-041 |
| BM25 lexical candidate retrieval; no model access required (Step 3, Config A) | REQ-APP-040 |
| Optional embedding-based semantic retrieval (Step 3, Config B) | REQ-APP-040 |
| Hybrid retrieval + LLM ranking of bounded candidates (Step 3–4, Config C) | REQ-APP-012, REQ-APP-040 |
| Configurable candidate-set size (Step 3) | REQ-APP-040 |
| LLM proposals with classification, confidence score, and rationale (Step 4) | REQ-APP-012, REQ-APP-013 |
| Malformed responses reported as failures and recorded separately (Step 4) | REQ-APP-044 |
| Human review: accept / reject / redirect; no automatic acceptance (Step 4) | REQ-APP-013, §6 |
| Decisions recorded with reviewer, timestamp, and commit (Step 4) | REQ-APP-013 |
| Link storage in requirement frontmatter (Step 5) | REQ-APP-013 |
| Generated `.spectrace/index.json`, rebuildable from specs + repository (Step 5) | REQ-APP-013, REQ-APP-045, NFR-APP-005 |
| Bidirectional navigation: requirement → code units; symbol → requirements (Step 5) | REQ-APP-014 |
| List requirements with no accepted links; coverage reporting (Step 5) | REQ-APP-020 |
| Human-readable and JSON output for scripting/CI (Step 5) | REQ-APP-022, REQ-APP-043 |
| Git-aware incremental re-evaluation of only affected links (Step 6) | REQ-APP-021, REQ-APP-045 |
| Drift: deleted symbol (D1/D2 deterministic, no model call) (Step 6) | REQ-APP-021 |
| Drift: suspected rename (Step 6) | REQ-APP-021 |
| Drift: requirement changed, code unchanged (semantic) (Step 6) | REQ-APP-021 |
| Drift: code changed contradicting requirement (semantic) (Step 6) | REQ-APP-021 |
| Unimplemented requirement reported (D5) (Evaluation) | REQ-APP-020, REQ-APP-021 |
| Drift warnings carry category, confidence, rationale, implicated commits; confirm/dismiss (Step 6) | REQ-APP-021 |
| Confidence thresholds: provisional bands, tunable, reported with results (Evaluation) | REQ-APP-042, REQ-APP-013 |
| Results recorded with commit, configuration, model snapshot, prompt version (Evaluation) | REQ-APP-043 |
| Token usage and estimated API cost accounting (Evaluation / Resources) | REQ-APP-012, NFR-APP-003 |
| Incremental vs. full analysis comparison (runtime, tokens) (Evaluation) | REQ-APP-045 |
| No automatic source-code modification (Scope) | AD-4, §6 |
| TypeScript/JavaScript projects initially; language expansion via core (Scope) | §6 |
