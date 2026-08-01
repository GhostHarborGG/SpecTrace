---
id: SPEC-APP-000
title: SpecTrace Studio — Product Specification
status: Draft
version: 0.2.0
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

Requirements follow the SpecTrace schema: stable ID, rationale, acceptance criteria, status, priority. Trace links are empty until implementation begins and will be populated by SpecTrace itself. Phrasing follows EARS where applicable.

### 4.1 Vault and editing

---
**REQ-APP-001 — Open and manage a vault**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The vault is the unit of everything else; without Obsidian-grade vault ergonomics the product has no wedge.
- **Requirement:** The application shall open a local directory as a vault, display its markdown files in a navigable file tree, and support creating, renaming, moving, and deleting files and folders.
- **Acceptance criteria:**
  - AC1: Opening a directory containing markdown files displays them in a file tree within 2 s for vaults up to 1,000 files.
  - AC2: File operations performed in Studio are ordinary filesystem operations, visible to external tools immediately.
  - AC3: Files edited externally while the vault is open are detected and reloaded (or a conflict prompt shown if the buffer is dirty).

---
**REQ-APP-002 — Markdown editing with live preview**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** Editing must feel like Obsidian/Outline, not a plain textarea; this is the adoption bar.
- **Requirement:** The editor shall support CommonMark + GFM (tables, task lists, fenced code) with an Obsidian-style live preview mode in which formatting renders in place while remaining editable as markdown.
- **Acceptance criteria:**
  - AC1: Round-tripping a file through the editor produces no diff beyond the user's edits.
  - AC2: Headings, emphasis, lists, tables, code blocks, and links render in live preview.
  - AC3: A raw-source mode is always available per pane.

---
**REQ-APP-003 — Wiki-links and backlinks**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** Backlinks are the mechanism by which a spec becomes a knowledge base rather than a folder of documents.
- **Requirement:** The editor shall support `[[wiki-link]]` syntax with autocomplete against vault files and requirement IDs, and every document shall display a backlinks panel listing documents that link to it.
- **Acceptance criteria:**
  - AC1: Typing `[[` opens autocomplete over file names, aliases, and requirement IDs.
  - AC2: Renaming a file offers to update inbound wiki-links.
  - AC3: Backlinks panel updates within 1 s of a link being created elsewhere in the vault.

---
**REQ-APP-004 — Frontmatter-aware requirement documents**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The SpecTrace schema lives in frontmatter; the editor must make schema compliance easy rather than policed.
- **Requirement:** When a document matches the SpecTrace requirement schema, the application shall render frontmatter (ID, status, priority, trace links) as an editable properties panel, validate it against the schema from `@spectrace/core`, and surface violations (duplicate IDs, missing acceptance criteria) inline.
- **Acceptance criteria:**
  - AC1: Creating a document from a requirement template produces schema-valid frontmatter with a unique generated ID.
  - AC2: A duplicate ID anywhere in the vault is flagged in both offending documents within 2 s.
  - AC3: Trace-link entries in frontmatter render as navigable chips, not raw YAML.

---
**REQ-APP-005 — Specification templates**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** Mirrors the CLI's Step 2 deliverable; templates are how a team without specs gets started.
- **Requirement:** The application shall ship the core's templates (use case, functional requirement, non-functional requirement, ASR, acceptance criteria) as new-document options, and shall support user-defined templates in the vault.
- **Acceptance criteria:**
  - AC1: All core templates are available from the new-document flow.
  - AC2: A markdown file in `.spectrace/templates/` appears as a template option without restart.

### 4.2 Repository connection and analysis

---
**REQ-APP-010 — Connect a GitHub repository (read-only)**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The repo connection is the product's differentiator; read-only scope keeps the security story trivial.
- **Requirement:** The application shall connect a vault to one GitHub repository using a fine-grained personal access token with read-only contents permission, validate the token's scope on entry, and refuse tokens with write permissions.
- **Acceptance criteria:**
  - AC1: A token with write scope is rejected with an explanation.
  - AC2: Connection state (repo, branch, last-synced commit SHA) is visible in the UI at all times.
  - AC3: Tokens are stored in the OS keychain, never in the vault.

---
**REQ-APP-011 — Repository sync and local cache**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** Analysis must be reproducible and rate-limit-safe (AD-3); the API is a transport, not a data store.
- **Requirement:** The application shall mirror the connected repository's tracked source files into a local cache keyed by commit SHA, syncing on demand and on a configurable interval, honoring the core's exclusion configuration (generated/vendored/minified paths), and shall run all indexing against the cache.
- **Acceptance criteria:**
  - AC1: Two analysis runs against the same SHA produce identical indexes with zero API calls on the second run.
  - AC2: Sync of a 5,000-file repository delta completes without exceeding GitHub secondary rate limits.
  - AC3: The UI shows cache size and offers cache eviction per repository.

---
**REQ-APP-012 — Run analysis (index, retrieve, rank)**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** This is the core loop; Studio adds progress, cost visibility, and interruption on top of the engine.
- **Requirement:** The application shall run the core's pipeline (index → candidate retrieval → optional LLM ranking) over the vault's requirements against the cached repository, displaying per-stage progress, live token/cost accounting, and supporting cancellation; results shall be identical to an equivalent CLI invocation at the same core version.
- **Acceptance criteria:**
  - AC1: A run over the controlled evaluation repository matches CLI output byte-for-byte at the proposal/index level.
  - AC2: Estimated cost is shown before the LLM stage starts and actual cost after it completes.
  - AC3: Cancelling mid-run leaves the last completed stage's artifacts intact.

---
**REQ-APP-013 — Link review queue**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** Human confirmation is the engine's trust model; a GUI queue is where Studio most improves on the CLI.
- **Requirement:** The application shall present proposed links in a review queue grouped by the core's confidence bands (auto-suggest > 0.75; review 0.50–0.74; discarded < 0.50 available under a toggle), showing for each proposal the requirement, candidate symbol with source preview, confidence, and model rationale; the reviewer shall be able to accept, reject, or redirect each proposal, with every decision recorded with reviewer, timestamp, and commit SHA.
- **Acceptance criteria:**
  - AC1: Accepting a proposal writes the link to the requirement's frontmatter and the index, matching CLI storage exactly.
  - AC2: Keyboard-only triage (next/accept/reject/redirect) is possible.
  - AC3: Redirect allows searching the symbol index and attaching the corrected target.
  - AC4: The decision audit record is exportable as JSON.

---
**REQ-APP-014 — Bidirectional navigation**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** Navigation is the payoff of every accepted link; both directions must be first-class.
- **Requirement:** From a requirement document, the application shall list linked code units with source previews; from any symbol in the symbol index, the application shall list the requirements linked to it; each direction shall be reachable in one action from the other.
- **Acceptance criteria:**
  - AC1: A requirement's linked-symbols panel opens read-only source at the symbol's current location in the cached SHA.
  - AC2: Symbol search ("which requirements touch `AuthService.login`?") returns results in under 500 ms on the controlled repo.
  - AC3: Broken links (symbol no longer resolves) are visually distinct, not hidden.

### 4.3 Status: coverage and drift

---
**REQ-APP-020 — Coverage dashboard**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** "Implementation coverage per spec item" is half of the product's definition of development status.
- **Requirement:** The application shall display vault-level and per-document coverage: counts and lists of requirements with accepted links, with proposals pending review, and with no links; each requirement document shall show a status badge derived from this state.
- **Acceptance criteria:**
  - AC1: Dashboard totals reconcile exactly with the core's coverage command output.
  - AC2: Clicking any count opens the corresponding filtered requirement list.
  - AC3: Badges update without a full re-analysis when a link is accepted or rejected.

---
**REQ-APP-021 — Drift surfacing**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** "Spec–code drift detection" is the other half of development status; warnings must land where the reader already is.
- **Requirement:** After each sync, the application shall run the core's git-aware incremental drift analysis over affected links and surface warnings in three places: a vault-level drift inbox, inline banners on affected requirement documents, and badges in the file tree; each warning shall show the drift category (deleted symbol, suspected rename, requirement changed, suspected semantic contradiction, unimplemented requirement), confidence, rationale, and the implicated commits, and shall be confirmable or dismissible with an audit record.
- **Acceptance criteria:**
  - AC1: Each of the five drift scenarios from the CLI evaluation (D1–D5), injected into the connected repo, produces a warning of the correct category after sync.
  - AC2: Dismissing a warning suppresses it for that link+commit pair only; new commits re-evaluate.
  - AC3: Deterministic categories (delete/rename) surface without any LLM call or cost.

---
**REQ-APP-022 — Status reporting**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The knowledge base should answer "what's the status of development?" as a shareable artifact, not only an in-app view.
- **Requirement:** The application shall generate a status report (markdown and JSON) summarizing coverage, open drift warnings by category, review-queue depth, and deltas since a chosen prior commit or date.
- **Acceptance criteria:**
  - AC1: The markdown report is itself a valid vault document with wiki-links into the requirements it cites.
  - AC2: The JSON report is stable-schema'd and versioned for CI or external tooling.

### 4.4 Search

---
**REQ-APP-030 — Unified search**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Requirement:** The application shall provide full-text search across vault documents and symbol-index metadata from a single search field, with filters for document type, requirement status, and link state.
- **Acceptance criteria:**
  - AC1: Search over a 1,000-file vault returns first results in under 300 ms.
  - AC2: Requirement-ID exact matches rank first.

### 4.5 Analysis configuration, provenance, and administration

These requirements close the gap between Studio and the full CLI capability set: every configuration, safeguard, and record-keeping behavior in the capstone proposal has a first-class surface in the application. See Appendix A for the full capability traceability matrix.

---
**REQ-APP-040 — Retrieval configuration (Configurations A/B/C)**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The proposal's three evaluated configurations (A: BM25 lexical; B: embeddings; C: hybrid + LLM ranking) are core capabilities, not internals; users must be able to choose the cost/quality point the evaluation report describes — including running fully offline with no model access.
- **Requirement:** The application shall expose per-vault analysis settings for retrieval mode (lexical, semantic, hybrid), candidate-set size, and embeddings on/off, defaulting to the configuration the capstone evaluation recommends; configuration A shall run with no LLM or embedding API access whatsoever.
- **Acceptance criteria:**
  - AC1: Each of configurations A, B, and C is selectable and produces results matching the CLI under the same configuration.
  - AC2: With configuration A selected and no API keys present, analysis completes with zero network calls to model providers.
  - AC3: Candidate-set size changes take effect on the next run without reindexing.

---
**REQ-APP-041 — Repository exclusion configuration**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The proposal's indexer honors a .gitignore-style exclusion list for generated, vendored, and minified paths; Studio must let users author it, not just inherit it.
- **Requirement:** The application shall provide an editor for the core's exclusion configuration with gitignore-style patterns, showing a live count of files currently excluded from indexing.
- **Acceptance criteria:**
  - AC1: Pattern edits persist to the core's configuration file in the vault, readable by the CLI unchanged.
  - AC2: The excluded-file count updates after edit without a full analysis run.

---
**REQ-APP-042 — Confidence threshold configuration**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The proposal defines provisional bands (auto-suggest > 0.75; review 0.50–0.74; discard < 0.50) explicitly as starting points to be tuned; the tuned values are part of the tool's operation and must be user-visible and adjustable.
- **Requirement:** The application shall display the active confidence bands, allow per-vault adjustment within core-validated ranges, and re-bucket existing unreviewed proposals when bands change; active band values shall be recorded with every analysis result.
- **Acceptance criteria:**
  - AC1: Defaults match the core's shipped (evaluation-tuned) values.
  - AC2: Changing a band re-buckets pending proposals without re-invoking the model.
  - AC3: Accepted/rejected decisions are never altered by band changes.

---
**REQ-APP-043 — Run provenance**
- **Priority:** P0 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The proposal commits to reporting every result with the commit, tool configuration, model snapshot, and prompt version that produced it; Studio must preserve that discipline or its results are not comparable to the CLI's or to each other.
- **Requirement:** The application shall attach a provenance record — repository commit SHA, core version, retrieval configuration, model snapshot identifier, prompt version, and confidence bands — to every proposal, drift warning, and generated report, display it on demand in the UI, and include it in all JSON exports; re-runs shall be diffed against prior proposals rather than silently replacing them.
- **Acceptance criteria:**
  - AC1: Any proposal or warning in the UI can reveal its full provenance record in one action.
  - AC2: Two runs under different model snapshots are stored and displayed as distinct result sets.
  - AC3: JSON exports validate against a versioned provenance schema shared with the CLI.

---
**REQ-APP-044 — Malformed-response and failure reporting**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The proposal treats malformed model responses as recorded failures, kept separately for evaluation; Studio must surface them, not swallow them.
- **Requirement:** When a model response fails schema validation, the application shall record the failure with its provenance, exclude it from the review queue, and display a failures panel with counts per run and per requirement; failures shall be exportable alongside decision audit records.
- **Acceptance criteria:**
  - AC1: An injected malformed response appears in the failures panel and never as a reviewable proposal.
  - AC2: Failure counts per run are included in the status report (REQ-APP-022).

---
**REQ-APP-045 — Index rebuild and full re-analysis**
- **Priority:** P1 · **Status:** Proposed · **Rendition:** 1
- **Rationale:** The proposal guarantees the generated index is rebuildable from the specifications and repository, and evaluates incremental analysis against full analysis; both operations must be user-invokable.
- **Requirement:** The application shall provide explicit actions to (a) rebuild `.spectrace/index.json` and all derived state from the vault and cached repository, and (b) run a full re-analysis of all links ignoring incremental scoping, with the UI reporting links evaluated, runtime, and token usage for comparison against the incremental path.
- **Acceptance criteria:**
  - AC1: Deleting `.spectrace/index.json` and invoking rebuild restores an index identical to the pre-deletion state at the same SHA.
  - AC2: Full re-analysis and incremental analysis at the same SHA pair produce consistent drift conclusions, with their runtime and token counts displayed side by side.

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
