---
title: Feasibility Experiment — Retrieval Error Analysis
status: DRAFT for BP review — per-miss classification (§3) is BP-only and incomplete
config: bm25f-v5 · commit b77477c027039362ee0ec4f39b8998c4f1b21707 · engine 0.1.0
drafted: 2026-08-02
updated: 2026-08-02
evidence: runs/ through runs/bp-check/results-v5.jsonl
---

# Retrieval Error Analysis (prelim spec §14)

**Provenance and blinding.** Sections 1, 2, 4, and 5 were drafted by Claude
from blinding-safe evidence only: aggregate metrics (verified independently
by BP), ranked retrieval output with scores, the query/corpus term space,
and the frozen repository — ground truth was never opened (CLAUDE.md rule 1
as amended 2026-08-02). Section 3, the per-miss classification the spec
requires, needs ground-truth knowledge and is **BP's to complete and own**.
Nothing in this document asserts which candidate is correct for any
requirement.

## 0. Evidence set and reproducibility

This revision reconciles every artifact currently under `runs/`. The
comparison set is the frozen 12-requirement fixture (combined requirement
set SHA-256 `330adba5…d3e7`) against the 49-symbol index at repository commit
`b77477c…21707`. Every retrieval artifact contains 12 ranked lists of 10
candidates and declares engine version `0.1.0`.

| Evidence | Role in this analysis |
|---|---|
| `runs/hookable-index.jsonl` | Frozen 49-symbol corpus used for term-space and granularity analysis |
| `runs/hookable-metrics.json` | Stored aggregate baseline for `bm25f-v3`; it is not the final v5 report |
| `runs/opt/results-bm25f-v1-approx.jsonl` through `results-v7.jsonl` | Version trajectory, including the retained v6/v7 negative results |
| `runs/opt/results-v5.jsonl` | Selected final configuration |
| `runs/opt/results-v5-confirm.jsonl` | Deterministic confirmation |
| `runs/bp-check/results-v5.jsonl` | BP's independent reproduction |

The three v5 files are byte-for-byte identical (SHA-256
`7eb400f2…f1384`), including ranks, symbol IDs, and floating-point scores.
This confirms determinism across the optimization run, confirmation run,
and BP check. Aggregate metrics below were regenerated from the saved
retrieval artifacts under the permitted blinded procedure; no
per-requirement evaluation output was consumed.

## 1. Headline result (bm25f-v5, n=12)

| Stratum | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| overall | .250 | .708 | .750 | .917 | .515 |
| high-overlap | .500 | .750 | .750 | 1.000 | .661 |
| partial-overlap | .000 | .750 | .750 | .875 | .375 |
| domain-vocabulary | .250 | .625 | .750 | .875 | .508 |

Hit@5 91.7%, Hit@10 100% overall: for every requirement at least one
labeled symbol is in the top-10, and for 11 of 12 in the top-5. The
retrieval-first premise — a local stage placing correct symbols in a short
candidate list — holds on this fixture. The residual errors are
concentrated at @1 (unchanged at .250 from v2 through v7) and in the
recall mass that never enters the top-10 in the two harder strata.

The headline `overall` row uses the frozen independent-only labels. The
candidate-assisted pass-two additions change the denominator and some
aggregate values, but not the feasibility conclusion:

| Label set | R@1 | R@3 | R@5 | R@10 | H@5 | H@10 | MRR |
|---|---|---|---|---|---|---|---|
| independent-only (headline) | .250 | .708 | .750 | .917 | 91.7% | 100% | .515 |
| independent + candidate review | .250 | .674 | .757 | .889 | 100% | 100% | .544 |

### Version trajectory

All rows below were recomputed from the corresponding saved retrieval file
using the independent-only labels. `bm25f-v5` is the selected configuration;
v6 and v7 remain in the record as measured failures.

| Configuration | R@1 | R@3 | R@5 | R@10 | H@5 | MRR | Disposition |
|---|---|---|---|---|---|---|---|
| bm25f-v1-approx | .083 | .083 | .250 | .625 | 25.0% | .190 | Approximate baseline |
| bm25f-v2 | .250 | .375 | .500 | .875 | 58.3% | .427 | Superseded |
| bm25f-v3 | .250 | .458 | .625 | .875 | 75.0% | .443 | Stored baseline metrics |
| bm25f-v4 | .250 | .625 | .750 | .917 | 91.7% | .499 | Shipped normalization corrections |
| **bm25f-v5** | **.250** | **.708** | **.750** | **.917** | **91.7%** | **.515** | **Selected default** |
| bm25f-v6 | .250 | .625 | .667 | .917 | 75.0% | .501 | Regressed; reverted |
| bm25f-v7 | .250 | .625 | .667 | .917 | 83.3% | .501 | Regressed; reverted |

The trajectory localizes the remaining problem. Corrections through v5
substantially improved short-list coverage, while R@1 plateaued at .250
from v2 onward. The two later ranking interventions preserved R@10 but
moved relevant mass in the wrong direction at smaller cutoffs.

## 2. Failure mechanisms (label-free evidence)

The two weak strata fail for *different* reasons. Measured over the query
term space (49 symbols, 309 distinct post-filter terms) and the v5 ranked
output:

**M1 — Vocabulary starvation (dominant in partial-overlap).**
64% of partial-overlap query tokens (74% of distinct terms) have zero
document frequency and therefore contribute exactly nothing to any score.
Mean live-IDF mass per requirement: high-overlap 15.49, domain-vocabulary
10.48, partial-overlap **3.60** — an ordering that reproduces the measured
MRR ordering exactly. Two queries are effectively empty: HOOK-007 retains
three live terms (mass 1.46) and HOOK-008 three (mass 2.60). These
requirements are not mis-ranked; they are ranked on almost nothing, and the
resulting lists are flat near-ties decided by incidental source-body
overlap.

**M2 — Missing prose bridge (dominant in domain-vocabulary).**
Of 84 distinct dead query terms corpus-wide, 66 have no lexical neighbour
in the index under any tested morphology (`handler`, `unregister`,
`dispatch`, `observer`, `invocation`, `pipeline`, …). The bridge exists in
the repository's *prose* — `handler` ≈20×, `unregister` ≈12× in README.md —
but the indexer indexes only `.ts` symbols, and the code itself has zero
JSDoc: the `documentation` field is populated for 4 of 49 symbols with a
9-term vocabulary, two of them just `@deprecated`. Weighting cannot fix an
empty field; this is a content gap, not a scoring defect.

**M3 — Aggregate crowding (residual; largely corrected in v4/v5).**
Aggregate symbols (files, modules, container classes) whose text is the
union of their members' text outranked the implementing member on identical
evidence — the container class `Hookable` carried tf=58 for a single
half-corpus term inside a 489-token body and appeared in 11/12 top-10
lists. v2's kind prior (file/module ×0.5) and v5's containment prior
(α=0.15) largely closed this; before v5, containers held 10/60 top-5 slots.

**M4 — Discrimination flattening (structural, present at all strata).**
BM25F's saturation constant (k1=1.2) sits ~6× below the summed
pseudo-frequency scale, so 69% of matched term-document pairs score at
≥75% of their ceiling and adjacent candidates collapse into near-tie bands
(some spanning ~1–2% of the top score across five ranks). Ranking then
degenerates toward "how many terms matched at all," which particularly
hurts @1 in low-signal queries. Two attempted corrections (v6 source-tf
saturation; v7 near-tie diversity reordering) both **regressed on
measurement and were reverted** — see §4.

**M5 — Normalization defects (corrected).** v2's stopword list deleted
`all`/`each`/`with`, which this corpus uses as identifier morphemes
(`removeAllHooks`, `beforeEach`/`afterEach`, `callHookWith`); the v3 plural
folder split `promises`/`promise` and never merged `fns`/`fn`. Both fixed
in v4, worth the largest single-revision gain of the series (overall R@5
.625→.750). Recorded here because the *class* of defect — prose-calibrated
normalization applied to identifier-derived text — is a real hazard for any
future repository.

### Mapping to the §14 taxonomy

| Mechanism | Primary §14 category |
|---|---|
| M1 starvation | Vocabulary mismatch |
| M2 missing prose bridge | Vocabulary mismatch / Missing documentation |
| M3 aggregate crowding | Incorrect granularity |
| M4 flattening | BM25F ranking failure |
| M5 normalization | BM25F ranking failure (identifier-normalization subtype) |

## 3. Per-miss classification — **BP to complete** (ground-truth required)

No `errors.jsonl` or equivalent classification artifact is present under
`runs/`, so this spec-required section cannot be completed from the supplied
run directory alone without crossing the blinding wall. Completion requires
BP to privately join the selected v5 ranks to ground truth, classify every
miss, and add the resulting reviewed records to the reproducibility bundle.

Instructions: run the evaluation privately with per-requirement output,
then for each miss record the §14 JSON object (`requirementId`,
`expectedSymbolIds`, `highestRelevantRank`, `category`, `explanation`,
`recommendedResponse`). The **evidence hints** column below is label-free
(query-side only) and may inform, but must not substitute for, your
judgment; in particular only you can distinguish *Ground-truth error* and
*Multiple valid implementations* from the mechanisms above.

| Req | Stratum | Label-free evidence hints | Category (BP) | Notes (BP) |
|---|---|---|---|---|
| HOOK-001 | high-overlap | — | | |
| HOOK-002 | high-overlap | — | | |
| HOOK-003 | domain-vocabulary | 11 dead terms (`fail`, `pipeline`, `absorbing`…); prose bridge exists only in a README migration bullet | | |
| HOOK-004 | high-overlap | `unregister` df=0 (README-only) | | |
| HOOK-005 | high-overlap | `unregister` df=0 | | |
| HOOK-006 | high-overlap | — | | |
| HOOK-007 | partial-overlap | 3 live terms, IDF mass 1.46 — near-empty query (M1) | | |
| HOOK-008 | partial-overlap | 3 live terms, mass 2.60 (M1) | | |
| HOOK-009 | partial-overlap | `all` was stopped pre-v4 (M5, corrected) | | |
| HOOK-010 | domain-vocabulary | 8 dead terms (`pluggable`, `dispatch`, `policy`…) | | |
| HOOK-011 | domain-vocabulary | `deprecation`/`deprecate` unmerged token split; otherwise bridgeable | | |
| HOOK-012 | domain-vocabulary | 12 of 21 terms dead with **no** lexical realization anywhere (M2 ceiling) | | |

## 4. Negative results (kept per §19: unfavorable runs stay in the record)

| Candidate | Mechanism | Outcome |
|---|---|---|
| bm25f-v6 | source-tf saturation κ=2 (attack on M4) | Regressed: overall R@3 .708→.625, R@5 .750→.667, H@5 91.7%→75.0%, MRR .515→.501. Reverted; id retired. |
| bm25f-v7 | near-tie diversity reordering (attack on M4 tie bands) | Regressed: overall R@3 .708→.625, R@5 .750→.667, H@5 91.7%→83.3%, MRR .515→.501; partial-overlap R@3/@5 .750→.500. Near-tied same-file siblings are often *multiple labeled symbols*; file diversity discards them. Reverted, spec clause withdrawn. |
| general stemming | -ing/-ed/-er/-ion suffix stripping | Rejected pre-implementation: merges `caller`→`call`, a live domain term (prelim §9.2 violation). |
| k1 retune | k1 ∈ {3,6,8} | Rejected: same family as v6; overfitting cap reached. |

Both shipped wins (v4, v5) corrected over-reach in existing mechanisms;
both measured failures added new mechanisms. On a 12-requirement fixture
that asymmetry is itself a finding: corrections generalize, cleverness
overfits.

## 5. Recommended next design steps (§14 closing requirement)

1. **Semantic retrieval (Configuration B, Phase C)** is now *specifically*
   motivated, not generically: M1/M2 show ~2/3 of hard-strata query
   vocabulary has no lexical surface form, and HOOK-012's identity
   ("observers at both invocation boundaries") is lexically unreachable in
   principle. Embeddings target exactly this residual.
2. **Doc-attachment indexing** (README API sections → symbol documentation
   field) is the lexical-side alternative for M2 — parked as a Phase C
   candidate pending a REQ-CORE-010 spec change, with the recorded validity
   caveat (requirements were authored from that README).
3. **Requirement-authoring guidance:** the *high-overlap* stratum also
   carries dead terms (`unregister`, `handler` — 37–64% dead-token mass),
   suggesting future requirement prose could name identifiers when known.
   Whether that is desirable or defeats the experiment's purpose is a
   methodology question for BP.
4. **LLM ranking (Phase D, deferred)** inherits a favorable input: Hit@5 is
   91.7%, so a top-5 classifier sees the correct answer for 11 of 12
   requirements. The @1 weakness is precisely what a ranking stage exists
   to absorb.

## 6. Threats to validity (for the report's §16)

- n=12 (4 per stratum): one requirement ≈ 8.3 points of recall; deltas
  below that are noise. The v4 gains exceed one requirement at key cutoffs;
  v5 adds one further @3 recovery. Treat MRR movement as directional only.
- Optimization iterated 4 measured versions against the same fixture with
  aggregate feedback; the cap and the negative-result record bound but do
  not eliminate adaptive-overfitting risk. External check: the mechanisms
  shipped are corrections with corpus-independent rationale.
- Evaluations were executed by Claude under the amended blinding rule
  (aggregates only); BP independently reproduced the v4/v5 tables on
  2026-08-02.
- The `bm25f-v1` baseline row in the version trajectory is approximate
  (v2's length-normalization fix is structural and cannot be disabled).
- Pass-two ground-truth additions shift v5 from R@3/R@5/R@10
  .708/.750/.917 to .674/.757/.889 and MRR .515→.544. Tables must state
  which label set they use; this document uses independent-only except
  where explicitly shown.
- Mechanisms M1–M5 are label-free causal hypotheses supported by corpus and
  score behavior, not completed per-miss diagnoses. The missing BP-owned
  classification artifact is the remaining gate on the §14 deliverable.
