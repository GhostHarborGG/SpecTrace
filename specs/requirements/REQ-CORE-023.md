---
id: REQ-CORE-023
title: Bounded candidate sets
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - A run's transmitted-content log contains exactly (requirements × ≤k) candidate excerpts and nothing else.
  - The log accounts for every transmission the run performed, not only the bounded payload; a semantic or hybrid run records the embedding model, the corpus-wide text counts, and how many texts went to the network rather than the local cache, and a log that omits this is reported as undisclosed.
  - A default-configured run transmits nothing outside the candidate set, and a run under the corpus-wide exception is refused unless the operator has explicitly accepted it.
---

# Bounded candidate sets

## Statement

Only the requirement text and its top-k candidates shall ever be transmitted
to a model — any model, generative or embedding — and no operation shall
transmit repository content outside the candidate set, with one exception:
the semantic and hybrid retrieval configurations (REQ-CORE-021,
REQ-CORE-022) embed every indexed symbol. That exception shall never be the
default, shall be disclosed before it is performed, and shall require the
operator's explicit acceptance.

## Rationale

The proposal's central architectural decision: cost proportional to
requirements, not repository size; operation beyond a single context window.

## Notes

Implemented in `packages/core/src/transmission/bounded-payload.ts` as the
single gate every model payload passes through. The bound is structural
rather than conventional:

- The module never receives a repository path — as with retrieval
  (REQ-CORE-020), excerpt text can only come from already-indexed symbols, so
  "read one more file while we're here" is not expressible.
- `buildTransmissionUnits` resolves symbols *through* the requirement's
  candidate list, never through the symbol table directly, so a candidate
  outside the retrieved set cannot be built into a payload.
- Every field is length-budgeted, so payload size is bounded by
  (requirements × k × budget) rather than by what happens to be in one file.

`auditTransmissionLog` is the checkable half: given a log and the run it
claims to describe, it re-derives the permitted excerpt count and reports
excess (`excess-candidates`, `unretrieved-candidate`, `unknown-requirement`,
`duplicate-requirement`, `oversized-field`). A log that *omits* a requirement
is reported as incomplete but still `bounded` — boundedness is about excess
only. That distinction is what makes AC1 checkable after the fact rather than
only by inspection.

Surfaced by `spectrace analyze --dry-run [--transmission-log <file>]`. The
dry run performs no *ranking*-model call, and there is no code path from the
payload assembly to one; retrieval, which runs first, is what transmits in
Configurations B and C. Ranking (REQ-CORE-030, Phase D) consumes these units;
it does not assemble its own.

## AC2 — the payload is not the only transmission

Configurations B and C embed **every symbol in the repository** during
retrieval, before any payload is assembled (REQ-CORE-021/022). That is
corpus-wide and therefore outside the bound above, so a log reporting only
the bounded payload can satisfy AC1 while leaving a reader with a materially
false picture of the run — which is the failure NFR-CORE-005 exists to
prevent. The log therefore carries a `retrieval` section naming the mode and,
in a transmitting mode, the embedding model, its dimensions, the symbol and
query text counts, and the split between texts sent over the network and
texts served from the local cache. The audit reports `undisclosed-embedding`
when a semantic or hybrid log is silent, `unexpected-embedding` when a
lexical log claims a transmission it cannot have made, and `mode-mismatch`
when the log describes a different mode than the run used.

`bounded` and `disclosed` are independent results, deliberately: a payload
can be perfectly bounded and the log still silent about the corpus, and that
combination is exactly the defect AC2 was added for (found 2026-08-04, fixed
the same day). Transmission-log artifact version 2 carries the section; a v1
log cannot describe Configuration B or C honestly.

## AC3 — scope resolved: "a model" means any model

**Decided 2026-08-04 (BP delegated the call).** The bound covers embedding
models as well as generative ones. Three things settled it:

- **BP's own usage.** "Model" in these specs means an LLM generally, not the
  ranking stage of §6. The narrow reading — that this requirement governs
  only the ranker — was never the plain sense of the text.
- **The rationale is the test.** "Cost proportional to requirements, not
  repository size" is violated by embedding every symbol, and it is violated
  identically whichever kind of model receives the texts. A reading under
  which a requirement's own stated rationale does not apply to the case at
  hand is motivated reasoning, not interpretation.
- **NFR-CORE-005 is a privacy requirement.** Privacy does not turn on model
  architecture. Sending 424 symbol texts to a third party is the same event
  whether they are embedded or completed.

So Configurations B and C were, as written, in violation rather than merely
under-reported. The statement now names them as an explicit exception with
three conditions attached, and the fact that **Configuration A remains the
shipped default (BP, 2026-08-04)** is what keeps that exception narrow: the
tool as delivered transmits nothing during retrieval, and reaching the
exception takes two deliberate acts rather than one.

`requiresCorpusTransmissionConsent` is the predicate; the CLI refuses with
`corpus_transmission_not_accepted` (exit 2) unless
`--accept-corpus-transmission` is passed. Two boundaries are deliberate:

- **A fully cached run is not gated.** Consent is about content leaving the
  machine, not about configuration. Gating a run that sends nothing would
  train an operator to wave the prompt through, and would break the offline
  reproduction of a recorded run that REQ-CORE-021 AC1 exists to guarantee.
- **The refusal quotes the real number** — texts not already cached, not an
  upper bound — because a consent prompt that overstates the ask is a consent
  prompt nobody reads.

Selecting `retrieval.mode: semantic` does not on its own tell an operator
that the whole repository is about to be sent to a third party. The gate is
what makes "opt-in" mean something beyond a config key.
