---
id: REQ-CORE-030
title: Proposal generation
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - Every stored proposal has all three fields populated.
  - Changing the prompt bumps the prompt version in all subsequent provenance records.
---

# Proposal generation

## Statement

For each candidate submitted, the model response shall be parsed into: a trace
classification, a confidence score in [0,1], and a brief rationale; the prompt
shall carry a version identifier recorded in provenance.

## Notes

Deferred to Phase D by the 2026-08-02 descope (BP). The feasibility
experiment's classification-accuracy and cost measurements (prelim PQ3, and
PQ4's token/latency/cost portion) are discharged when this lands.

Implemented in `packages/core/src/ranking/` (`prompt.ts`, `rank.ts`,
`types.ts`). One model call per requirement, over the bounded payload
REQ-CORE-023 assembled — `rankCandidates` takes `TransmissionUnit[]`, not a
repository, not an index, not a symbol table, so this stage has nothing to
widen a payload *with*. The provider is injected exactly as
`EmbeddingProvider` is (REQ-CORE-021): the engine constructs no client and
reads no key (CLAUDE.md rule 2), nothing in the module names a vendor, and the
whole stage is testable without a network.

A requirement whose retrieval returned no candidates makes no call. There is
nothing to spend a token on, and a model handed an empty list has been invited
to invent one.

## The classification vocabulary

`implements | supports | unrelated`. The first two are spelled exactly as
`LinkRelationship` spells them (REQ-CORE-070 ground truth), so a proposal and
a label compare directly — a divergence here would silently depress every
precision figure the capstone reports, and would do it without failing
anything. `unrelated` has no ground-truth counterpart because ground truth
records links that exist; it is the verdict that produces no link, and it is
retained rather than dropped, per REQ-CORE-041's requirement that withheld
proposals stay inspectable.

## AC1 — all three fields, or it is not a proposal

A verdict missing any of classification, confidence, or rationale does not
become a half-populated proposal; it becomes a REQ-CORE-031 failure record and
is excluded. Confidence outside [0,1] is rejected rather than clamped: a
clamped 4.0 is a fabricated 1.0, and the run would then report a confidence it
never received. Blank and whitespace-only rationales are rejected on the same
grounds, as are `NaN` and `Infinity` — both are numbers and neither is a
probability.

## AC2 — the version cannot drift from the prompt

Enforced structurally rather than by convention. `rankingPromptDigest()`
hashes every fixed byte the model sees — the system prompt and the user
message's scaffolding, but not the requirement or candidate data it frames —
and a guard test asserts that digest equals the recorded
`RECORDED_PROMPT_DIGEST`. Editing so much as a word of the template fails that
test, naming the constant to update and the version to bump.

The alternative — a comment asking the author to remember — is the discipline
that produces provenance records attributing three different prompts to one
version, which is precisely the defect AC2 exists to prevent. The version and
the digest are updated together or the build is red. `RANKING_PROMPT_VERSION`
is currently `rank-v1`; it reaches the run result and every failure record.
Prompt-wording iteration is a Phase D chat task, so this guard will earn its
keep shortly.
