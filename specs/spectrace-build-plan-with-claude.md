# SpecTrace — End-to-End Build Plan (Working with Claude)

**Companion to:** `spectrace-core-spec.md` (SPEC-CORE-000) · `spectrace-cli-spec.md` (SPEC-CLI-000) · `spectrace-product-spec.md` (SPEC-APP-000) · `spectrace-setup-integration-plan.md`
**Structure:** phases, gated by exit criteria — not calendar dates. Each phase maps to a milestone row in the CPSC 597 proposal's schedule table, so advisor reporting stays aligned, but a phase ends when its gate is green, not when a month ends. Studio work trails core by one phase throughout, then continues past the capstone into R1.1/R2.
**Principle:** the specs drive everything. Claude's job at every step is to work *from* the requirement IDs; your job is to own decisions, review output, and keep the specs authoritative. In a program that treats AI coding as a given, the graded skills are exactly the ones this plan hardens: planning, collaboration, and maintaining software over time.

---

## 0. Ground rules for the collaboration

### 0.1 Division of labor

| Yours (non-delegable) | Claude's (delegable) |
|---|---|
| All design decisions, schema freezes, threshold policy | Scaffolding, boilerplate, config files |
| Ground-truth link labeling (research validity depends on it) | Test authoring against acceptance criteria you approve |
| Every accept/reject/redirect in dogfooding | First-draft implementations of specced requirements |
| Evaluation methodology, running the experiments, interpreting results | Evaluation harness plumbing, metrics computation code, chart generation |
| Advisor communication, report writing (your voice) | Report skeletons, editing passes, literature-matrix formatting |
| Final review of every merged change | PR-sized diffs with rationale, refactors, doc sync |

### 0.2 Process documentation as a first-class deliverable

Your program's stance — AI coding is assumed; planning, collaboration, and maintenance are what need hardening — means the *process artifacts* of this plan are themselves demonstrations of competence, not compliance overhead. Treat them that way:

- Keep an **AI-collaboration log** in the repo (`docs/ai-assistance.md`): date, task, REQ ID, extent (scaffold / draft / review / pair-design). This is your planning-and-collaboration evidence — a documented human-AI development methodology is precisely the thing the program says matters. Confirm with your advisor what disclosure format they'd like it in, then it slots straight into the report's methodology section.
- **Research validity still needs one hard wall,** independent of any AI policy: the evaluation cannot be contaminated by the tools that built the system. Requirements for the controlled repo are written by you against docs (per your own protocol), ground truth is labeled by you, and Claude never sees the ground-truth file while helping build retrieval or ranking code. Enforce this mechanically: keep ground truth in a directory excluded from every Claude Code session (`.claudeignore`). This is the same discipline as blinding in any experiment — it protects your RQ1–RQ4 answers, not a policy.
- Your final report is written by you; Claude may outline, critique, and copyedit — and the report can honestly describe the spec-driven, AI-collaborative process as part of the contribution.

### 0.3 Where each Claude surface fits

- **This chat (with memory):** design decisions, spec changes, architecture debates, phase planning, unblocking. Memory already holds the project state, so decisions made here persist across sessions.
- **Claude Code (in the repo):** all implementation work. It reads the specs and CLAUDE.md directly, edits files, runs tests. One requirement ID per session is the ideal grain.
- **Artifacts/files from chat:** documents — specs, report skeletons, diagrams.

### 0.4 Repo conventions that make Claude effective

Create these in the Phase A scaffold:

- **`CLAUDE.md`** at repo root (Claude Code reads it automatically):
  - Project one-liner and pointer to `specs/` as authoritative.
  - Commands: `pnpm test`, `pnpm build`, `pnpm cli --`, fixture locations.
  - Hard rules: never touch `fixtures/ground-truth/**`; no `console.log`/env reads in `packages/core`; all core returns `structuredClone`-safe; every PR references a REQ ID; snapshots in `packages/cli/test/snapshots` are contracts — update only with explicit instruction.
- **Branch/commit convention:** `req/CORE-020-lexical-retrieval`; commit messages reference the REQ ID — this is dogfooding-adjacent (SpecTrace itself will later mine these).
- **Definition of done (every requirement):** implementation + tests covering each acceptance criterion + spec status flipped `Proposed → Implemented` + collaboration-log line.

### 0.5 The standing loop (repeat for every requirement)

1. **Spec check (chat, 5 min):** confirm the REQ's acceptance criteria still reflect intent; amend spec first if not.
2. **Delegate (Claude Code):** "Implement REQ-CORE-020 per specs/requirements/REQ-CORE-020.md. Write vitest tests for each acceptance criterion first, then implement until green. Don't modify snapshots."
3. **Review (you):** read the diff like a PR — especially anything touching storage formats, provenance, or thresholds (these are cross-document contracts).
4. **Record:** merge, flip spec status, log the collaboration.
5. **Per phase (chat):** review the phase gate, plan the next REQ batch, update risks.

---

## Phase A — Foundations & Feasibility

**Proposal milestone:** literature matrix and tool comparison completed; feasibility results and error analysis reported.

- **You:** select/freeze the feasibility repository; write the 12 requirements against its docs (three difficulty tiers, per protocol — authored solo for validity); first-pass ground-truth labeling.
- **Chat:** structure the literature matrix (columns, inclusion criteria); discuss each paper's relevance as you read; design the error-analysis taxonomy.
- **Claude Code:**
  - Setup-plan Phases 0–1: monorepo scaffold, workspace config, CI (`pnpm test` GitHub Action), CLAUDE.md.
  - Feasibility harness: TS Compiler API indexer spike (proto-REQ-CORE-010), BM25 retrieval (proto-REQ-CORE-020), Recall@k computation, results table generator.
- **Descoped (2026-08-02, BP):** the model-classification stage (proto-REQ-CORE-030 with usage accounting) moves to Phase D, and the controlled drift scenarios (prelim PQ5) to Phase F. Retrieval quality is the load-bearing half of the retrieval-first assumption; spike LLM code written against a still-moving retrieval contract invites exactly the calcification this phase warns against. The LLM portions of PQ3/PQ4 are measured in Phase D; the feasibility write-up records both deferrals in its limitations.
- **Gate:** Recall@k (overall and by difficulty stratum) in hand; error analysis drafted by you; go/no-go on retrieval quality; proposal revised if the numbers demand it.
- **Gate closed 2026-08-02 (BP): GO on retrieval quality.** Evidence: bm25f-v5 (overall R@5 .750, Hit@5 91.7%, Hit@10 100%, MRR .515), independently reproduced by BP with byte-identical artifacts; docs/feasibility-error-analysis.md drafted and revised. Carried into the report work, not the gate: the §14 per-miss classification (`errors.jsonl`, BP-only) and the deferred PQ3/PQ4/PQ5 items per the 2026-08-02 descope.
- **Watch-for:** don't let harness code calcify — it's a spike; the real REQ-CORE implementations in Phases B–C start clean and inherit only what review says is worth keeping.

## Phase B — Schema Freeze & Dataset (+ Studio skeleton)

**Proposal milestone:** schema and templates approved; ground-truth links frozen and recorded.

- **You:** decide config format (YAML vs JSON — REQ-CORE-004 open item); approve schema field semantics; freeze ground truth (two-pass protocol, second-pass additions recorded as threat to validity); label everything yourself.
- **Chat:** schema design review against REQ-CORE-001…003; split `spectrace-core-spec.md` out of the CLI spec now — the schema freeze is exactly when that contract stabilizes.
- **Claude Code:**
  - Implement REQ-CORE-001…004 (schema, validation, templates, config) + REQ-CLI-001/002 (`init`, `validate`) with full AC test coverage.
  - **Studio setup-plan Phase 3 begins in parallel** (small, bounded sessions): electron-vite scaffold, walking skeleton — folder picker → tree → markdown preview (REQ-APP-001 partial, REQ-APP-002 preview half).
- **Gate:** `spectrace init && spectrace validate` works on `specs/`; your own spec documents validate (they're already in the schema — fix whichever side is wrong, and note that this is the product working); Studio opens the vault read-only.

## Phase C — Indexing & Retrieval, Evaluated

**Proposal milestone:** Recall@k reported for configurations A and B on the labeled dataset.

- **You:** run the evaluations (Claude never touches ground truth); interpret recall by difficulty stratum (RQ3 data starts here).
- **Chat:** review retrieval results; decide merge strategy for hybrid mode (REQ-CORE-022 open item); adjust k default.
- **Claude Code:**
  - Production REQ-CORE-010…012 (indexer, exclusions, index artifact) and REQ-CORE-020…023 (retrieval A/B, bounded candidates) + REQ-CLI-003 (`index`).
  - Candidate (from the 2026-08-02 Phase A diagnosis, BP to approve as a REQ-CORE-010 spec change first): attach co-located markdown doc sections (README API headings) to their symbols' documentation field. On the hookable fixture this must be reported as a separate configuration line with a validity caveat — the experiment's requirements were authored from that README, so indexing it shifts what retrieval is being measured against.
  - Evaluation harness hardened: config-driven A/B runs, per-stratum reporting, chart output for the report.
  - Studio: CodeMirror 6 editor + wiki-links + backlinks (REQ-APP-002/003), frontmatter properties panel with live validation via core (REQ-APP-004) — the first real core-in-Electron integration.
- **Gate:** Recall@k table for A and B is report-ready; Studio edits a spec file and flags a duplicate ID live.

## Phase D — Ranking & Review (+ Studio sync and analysis)

**Proposal milestone:** end-to-end link proposal and review working; precision and recall reported for configuration C.

- **You:** review every proposal in the controlled run yourself (this doubles as override-rate data); tune prompt wording — prompt versions bump per REQ-CORE-030.
- **Chat:** prompt engineering iterations; malformed-response taxonomy; threshold behavior review (REQ-CORE-041).
- **Claude Code:**
  - REQ-CORE-030…032 (ranking, malformed handling, usage accounting), REQ-CORE-040…042 (review, bands, audit), REQ-CORE-050…052 (dual storage, queries, stale links), REQ-CLI-004…007 (`analyze`, `review`, `links`, `coverage`). The ranking work also discharges the feasibility measurements deferred from Phase A (prelim PQ3, and PQ4's token/latency/cost portion): run classification accuracy and cost on the frozen experiment repository.
  - CLI JSON snapshots recorded — these become Studio's parity suite (NFR-APP-007) permanently.
  - Studio: GitHub sync + SHA-keyed cache (REQ-APP-010/011), `runAnalysis` IPC with progress/cost streaming (REQ-APP-012), parity harness green.
- **Gate:** configuration C precision/recall reported; `spectrace analyze && spectrace review` full loop works; Studio runs the same analysis with identical output.

## Phase E — Navigation & the Review Queue (Studio's flagship)

**Proposal milestone:** bidirectional navigation working with human-readable and JSON output.

- **You:** design review of the queue UX (keyboard triage flow) — spend your design budget here; it's the product's best moment.
- **Chat:** queue interaction design; empty/error states; what "redirect" search feels like.
- **Claude Code:**
  - Any remaining REQ-CORE-051/052 polish; REQ-CLI-006/007 finalization.
  - Studio: review queue (REQ-APP-013) with keyboard triage, symbol-search redirect; bidirectional navigation panes (REQ-APP-014); coverage dashboard (REQ-APP-020).
- **Gate:** you triage a real proposal batch in Studio faster than in the terminal — measure it informally; that's your demo narrative.

## Phase F — Drift, Both Surfaces

**Proposal milestone:** drift confusion matrix reported; incremental against full analysis compared.

- **You:** inject the D1–D5 scenarios as isolated commits (per protocol); score detections; run incremental-vs-full comparisons. This also discharges the controlled-drift feasibility scenarios (prelim PQ5) deferred from Phase A.
- **Chat:** analyze confusion-matrix errors; decide any threshold retuning (tuned values become new defaults per §13 of the core spec).
- **Claude Code:**
  - REQ-CORE-060…063 (incremental scoping, categories, warning content, provenance) + REQ-CLI-008 (`drift`).
  - Studio: drift inbox, inline banners, tree badges (REQ-APP-021); settings surfaces (REQ-APP-040…042); failures panel (REQ-APP-044); rebuild actions (REQ-APP-045); status report generation (REQ-APP-022, REQ-APP-043).
- **Gate:** D1–D5 all detected correctly in both CLI and Studio at the same commits; confusion matrix report-ready.

## Phase G — Evaluation, Case Study & Full Dogfood

**Proposal milestone:** evaluation report drafted with all metrics and threats to validity.

- **You:** run the controlled evaluation across A/B/C; run the third-party case-study repository; administer the developer questionnaire; write the threats-to-validity section personally.
- **Chat:** results interpretation; report structure; chart review; case-study anomaly discussion.
- **Claude Code:** evaluation report scaffolding (tables/figures generated from run JSON — provenance included automatically via REQ-CORE-063); bug-fix queue from evaluation findings; Studio stabilization.
- **Dogfood switch-over completes:** all SpecTrace spec work happens in Studio, tracing its own repos; observations logged separately from controlled results, per your own protocol.
- **Gate:** evaluation report draft complete; RQ1–RQ4 each answered with data.

## Phase H — Write-up, Polish & Demo

**Proposal milestone:** final deliverables submitted.

- **You:** final report (your writing; Claude critiques and copyedits — and the report's methodology section can present the spec-driven human-AI process itself, which is squarely what your program values); record the demonstration (link generation → review → navigation → drift, end to end — in Studio if your advisor agrees it strengthens the story, CLI otherwise per scope).
- **Chat:** report critique passes; demo script; defense-question rehearsal.
- **Claude Code:** repository polish for public release — README, installation docs, template docs, issue templates; final test/coverage sweep; tag `v1.0.0` of core + CLI.
- **Gate:** submitted. Public repo live. Studio R1 P0 set complete (it tracked alongside, but it is *not* a capstone deliverable — keep that boundary clean in the report).

## Phase I — Product Phase (Ghost Harbor)

Begins after submission; no capstone constraints.

- **R1.1:** unified search (REQ-APP-030), template UX, Milkdown-style live preview, packaging/signing (retire the PoC shortcuts list).
- **R2 groundwork:** resolve OD-1 (git-merge vs CRDT) informed by R1 dogfooding; Supabase enters here for auth/roles if the git-merge baseline is chosen; multi-user spec work (roles for link acceptance, shared budgets).
- **Positioning:** the published evaluation is the marketing asset — accuracy, cost, and drift-detection numbers with documented methodology is a differentiator no competitor in the lightweight tier has.
- Revisit business structure (licensing, pricing, open-core vs proprietary Studio) as its own planning session — different conversation, same memory.

---

## 10. Risk register for the collaboration itself

| Risk | Signal | Mitigation |
|---|---|---|
| Claude-generated code drifts from spec | PR doesn't cite a REQ ID; tests don't map to ACs | Definition-of-done gate; reject the diff, re-delegate with the REQ text pasted |
| Ground-truth contamination | Any Claude session with ground-truth files in context | `.claudeignore` from day one; you run all evaluations |
| Spec and code diverge silently | Spec status says Implemented but ACs untested | Per-phase AC checklist; later, SpecTrace's own drift detection on its own repo (D3/D4 catches exactly this) |
| Studio steals capstone bandwidth | Core gate for the current phase isn't green but Studio features are landing | Hard rule: Studio work proceeds only while the current phase's core gate is on track |
| Over-delegation erodes your understanding | You can't defend a design choice viva-voce | For each subsystem, implement at least one nontrivial piece yourself; have chat quiz you on architecture rationale at each phase gate |
| Phase sprawl (gates never close) | A phase runs long with "one more thing" scope creep | Gates are the proposal's milestone rows — anything beyond a row's wording is next-phase backlog by default |

## 11. Cadence summary

- **Daily (build days):** one standing-loop cycle (§0.5), one REQ at a time.
- **Weekly (chat):** progress vs the current phase gate, next REQ batch, risk check.
- **Per phase gate:** milestone check against the proposal's schedule table; spec status audit; AC checklist; collaboration-log review; architecture-rationale quiz.
- **Per semester:** advisor checkpoint with the traceability matrices and collaboration log as evidence — for a traceability project built in an AI-forward program, auditable process *is* the portfolio piece.
