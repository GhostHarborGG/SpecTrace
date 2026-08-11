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

**AC2 and AC3 hold as of 2026-08-10. AC1 does not, and the earlier note here
overstated it.** Status stays `partial`.

## AC1 — what actually holds, and the seam that does not

The parity below is real but it is *coverage* parity. AC1 asks for a match "at
the proposal/index level", and until 2026-08-10 nothing in Studio produced a
proposal at all, so the criterion had nothing to be true about. The note as
written read as though the coverage envelope discharged it. Correcting that is
the point of this revision.

What is now shared: the whole pipeline. `retrieveForMode`,
`projectRankingCost`, and `rankWithBands` live in
`packages/core/src/pipeline/analysis.ts`, and both `spectrace analyze` and
`apps/studio/src/main/run-analysis.ts` call them. Ranking and banding are
paired inside `rankWithBands` deliberately — the band decides what reaches a
reviewer's queue, so two clients banding independently could show different
queues from identical proposals.

**The one remaining divergence is how a requirement becomes query text.**
`analyze` loads the evaluation-corpus format, whose `## Statement` section
feeds `buildRequirementQueryText`; core's vault schema (REQ-CORE-001) carries
no statement at all, so a vault requirement has only its title and acceptance
criteria to offer. Same join, different fields to join — which means different
BM25F input, hence different candidates, hence different proposals. It is
isolated in `vaultQueries` in `apps/studio/src/main/index.ts` and named there
rather than hidden inside the run.

**This needs a BP decision**, since either fix touches a contract: add a
statement to REQ-CORE-001's schema, or re-point the analysis pipeline at the
loader `analyze` uses (`packages/cli/src/requirements.ts`, which additionally
requires a `difficulty` field the spec vault does not carry). AC1 stays unmet
until then, and the honest reading is that Studio and the CLI currently
analyse two different requirement contracts.

## Coverage parity — structural, and unchanged

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

## AC2 — cost before and after

`runAnalysis` emits an `estimate` stage before ranking begins, carrying
`projectRankingCost`'s projection: call count, token counts, and a cost that
is computed from the exact transmission units the model will receive, not from
a payload of the same shape. After ranking it returns REQ-CORE-032's measured
usage — what the provider reported, never the estimate restated. The test
asserts the ordering directly rather than trusting it, by recording which
progress events had arrived at the moment of the first provider call.

An unpriced run reports `priced: false` with a zero cost rather than implying
the run was free.

## AC3 — cancellation

Each stage writes its artifact as it finishes, so what survives a cancellation
is whatever completed: `.spectrace/index.jsonl`, then `retrieval.json`, then
`proposals.json`. Cancellation is checked at stage boundaries and, inside
ranking, between provider calls — never mid-call, because a request in flight
has been paid for whether or not its answer is read, so discarding it would
spend the operator's money to save nothing.

Proposals produced before the stop are written with `partial: true` rather
than discarded, for the same reason. A cancelled run returns a `RunResult`
with `cancelled: true` instead of throwing: the criterion is that completed
work survives, and an exception invites the caller to throw it away.

`runAnalysis` takes an injected `RankingProvider`, so the entire pipeline —
including both criteria above — tests with no API key, no network, and no
spend. Providers are constructed at the IPC boundary in `main/index.ts`, where
reading `OPENAI_API_KEY` is allowed; core reads no environment (CLAUDE.md
rule 2).

## The renderer panel — landed 2026-08-10

`apps/studio/src/renderer/src/RunPanel.tsx` renders the four stages with live
meters, both cost figures side by side, a cancel control, and the artifacts
each stage wrote. Verified by driving the built app: stages completed in
order, an unpriced run displayed "unpriced" with tokens counted rather than a
misleading `$0.00`, and the measured panel explained *why* it was empty ("no
model configured — the run stopped after retrieval") instead of showing a
blank.

The two cost figures are never collapsed into one. The estimate is a
projection carrying a budgeted output allowance; the measured figure is what
the provider reported (REQ-CORE-032). Presenting either as the other would
misrepresent a number people spend money against.

## AC1 — unblocked, still unverified

The query-text divergence recorded above is **resolved**: REQ-CORE-001 gained
an optional `statement` on 2026-08-10, so `vaultQueries` now feeds
`buildRequirementQueryText` the same three fields `analyze` does, through the
same function. Studio and the CLI no longer retrieve on different text.

What remains is measurement, not mechanism. Nobody has yet run both clients
over the controlled evaluation repository and diffed the proposals
byte-for-byte, and the proposal half of that comparison needs a ranking model
and therefore real spend. The index and retrieval halves could be compared
today at no cost and would be worth doing first.

Status stays `partial` on that basis: the criterion says "matches
byte-for-byte", and nothing has yet checked that it does.
