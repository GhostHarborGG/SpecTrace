# AI Collaboration Log

Methodology record for human–AI development on SpecTrace
(build plan §0.2). One line per delegated task.

| Date | REQ / Task | Surface | Extent |
|---|---|---|---|
| 2026-08-01 | Specs: SPEC-CLI-000, SPEC-APP-000, setup + build plans | Claude chat | pair-design; drafts reviewed & owned by BP |
| 2026-08-01 | Phase A scaffold (workspaces, CI, CLAUDE.md, package stubs) | Claude chat | scaffold |
| 2026-08-01 | Prelim harness (spec-trace-prelim repo: indexer, BM25F, metrics, CLI; built across prior sessions) | Claude Code | draft; reviewed by BP |
| 2026-08-01 | Experiment repo freeze record (unjs/hookable v6.1.1; §5.2 record; tag→SHA verified) — selection by BP | Claude Code | scaffold |
| 2026-08-01 | Port prelim harness into monorepo as packages/prelim + fixtures (todo-example, experiment/) | Claude Code | scaffold |
| 2026-08-01 | REQ-CORE-010/011/020: promote indexer + BM25F retrieval into @spectrace/core with AC-mapped tests; prelim rewired to consume core | Claude Code | draft (promoted from reviewed spike code) |
| 2026-08-01 | HOOK-001..012 transcription: BP-authored requirement statements (strata assigned by BP) transcribed into §6.3 schema files; retrieval-relevant text (title/statement/ACs) preserved verbatim or decomposed from BP wording, no vocabulary added; rationale/notes (non-retrieval fields) drafted by Claude | Claude Code | scaffold/transcription |
| 2026-08-01 | Ground-truth links (fixtures/ground-truth/hookable.json, 24 links, validate: 0 errors): authored by BP with the help of a separate AI session; labels owned by BP | BP + Claude chat (separate session) | pair-labeling; BP-owned |
| 2026-08-01 | REQ-CORE-020: BM25F revisions bm25f-v2 (function-word stopwords, non-empty-field length normalization, file/module kind prior 0.5) and bm25f-v3 (plural folding) with tests; diagnosis from retrieval output + aggregate metrics only — ground truth never read (blinding wall §0.2); evaluation runs executed by BP | Claude Code | draft; reviewed & measured by BP |
