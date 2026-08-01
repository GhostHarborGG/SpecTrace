# @spectrace/prelim

Preliminary experiment harness for SpecTrace (the Phase A feasibility
spike — see the build plan's "don't let harness code calcify" note; this
package is experiment tooling, not product code). Implements the tool
described in [`specs/spectrace-prelim-spec.md`](../../specs/spectrace-prelim-spec.md):
symbol-level TypeScript indexing, BM25F lexical retrieval, LLM-assisted ranking
of a bounded candidate set, and controlled-drift evaluation.

Ported from the standalone `spec-trace-prelim` repository into this
monorepo. Example target data lives in
[`fixtures/todo-example/`](../../fixtures/todo-example/); the frozen
experiment inputs (repository selection, requirements, drift scenarios)
live in [`fixtures/experiment/`](../../fixtures/experiment/), and
ground-truth labels live in `fixtures/ground-truth/` (off-limits to
Claude sessions per CLAUDE.md rule 1).

## Status

Under active development, built out in the phases from spec §20.
Implemented so far:

- [x] Project scaffold (package.json, tsconfig, vitest)
- [x] Requirements parser and validator (§6) — `src/requirements/` (experiment schema with `difficulty`; the product schema is REQ-CORE-001/002, implemented separately in core)
- [x] Deterministic symbol-ID generation, incl. overload disambiguation (§8.3) — **promoted to `@spectrace/core`** (REQ-CORE-010) as `core/src/indexer/symbol-id.ts`
- [x] TypeScript indexer (§8) — **promoted to `@spectrace/core`** (REQ-CORE-010/011) as `core/src/indexer/` (syntactic extraction, no full type-checked Program; see file-level doc comment for why)
- [x] Identifier-aware tokenizer (§9.2) — **promoted to `@spectrace/core`** (REQ-CORE-020) as `core/src/retrieval/tokenizer.ts`
- [x] BM25F retrieval (§9.3) — **promoted to `@spectrace/core`** (REQ-CORE-020) as `core/src/retrieval/bm25.ts` + `retrieve.ts`; `src/retrieval/rank.ts` here is a thin experiment-schema adapter over the core API
- [x] CLI: `requirements validate`, `index`, `retrieve` (§17) — `src/cli/index.ts`; the other five §17 commands are registered so `--help` shows the full intended surface, but each currently exits 2 with `not_implemented` until their phase lands
- [x] Ground-truth schema, validator, and scaffold generator (§7) — `src/evaluation/ground-truth.ts`, CLI: `ground-truth scaffold`, `ground-truth validate`. This tooling only checks shape and ID references — it never proposes or judges a link; pass-one/pass-two labeling (§7.1-§7.2) is done by hand in the generated JSON file.
- [x] Retrieval metrics: Recall@k, Hit@k, MRR (§10) — `src/evaluation/retrieval-metrics.ts`, CLI: `evaluate retrieval`. Implements all six §10.4 breakdowns (overall, high/partial/domain-overlap, independent-only, independent+candidate-review).
- [ ] LLM ranking stage (§11) — `rank`, `evaluate links`
- [ ] Human review record (§12)
- [ ] Drift scenarios (§13) — `drift`
- [ ] Error analysis (§14)
- [ ] Reproducibility manifest / report generation (§15, §19) — `report`

68 tests passing (`pnpm test`); `pnpm build` produces `dist/` and
`bin/spectrace-prelim.js` runs against it. Known simplifications worth
knowing about before relying on this for the real experiment repository:
the indexer only extracts module-level declarations and direct class
members (no nested/local functions), interface inclusion is a name-matching
heuristic rather than semantic type resolution, and the `--config <file>`
CLI flag is accepted but not yet consumed by any command.

## Setup

From the monorepo root:

```bash
pnpm install
pnpm --filter @spectrace/prelim test
pnpm --filter @spectrace/prelim typecheck
```

## CLI (in progress)

The target command surface (spec §17):

```text
spectrace-prelim requirements validate
spectrace-prelim index --repo <path> --commit <sha> --out <index>
spectrace-prelim retrieve --requirements <dir> --index <file> --top-k 10
spectrace-prelim evaluate retrieval --results <file> --ground-truth <file>
spectrace-prelim rank --results <file> --top-k 5 --model <model>
spectrace-prelim evaluate links --responses <dir> --ground-truth <file>
spectrace-prelim drift --base <sha> --scenario <sha>
spectrace-prelim report --run <run-id>
```

During development, run it unbuilt from the monorepo root via:

```bash
pnpm prelim requirements validate --dir fixtures/experiment/requirements
```

## Project layout

`src/` and `tests/` mirror spec §16, with one deviation: the `experiment/`
directory from the spec's suggested layout lives at the monorepo's
`fixtures/experiment/` (frozen external-repository selection, requirements,
drift scenarios) and `fixtures/ground-truth/` (labels) instead of inside
this package — none of that is fabricated by this harness; it has to come
from a real external repository and real documentation review.

The end-to-end pipeline check against `fixtures/todo-example` is
`scripts/test-prelim.ps1` at the monorepo root.
