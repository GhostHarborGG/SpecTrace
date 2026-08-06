---
id: REQ-CORE-031
title: Malformed-response handling
spec: SPEC-CORE-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - An injected malformed response yields a failure record, a nonzero failure count in run output, and an otherwise-completed run.
---

# Malformed-response handling

## Statement

A response failing schema validation shall be recorded as a failure with its
provenance and raw payload reference, excluded from proposals, and tallied
separately for evaluation reporting; malformed responses shall never crash a
run.

## Notes

Implemented in `packages/core/src/ranking/rank.ts`. Every fault — a provider
timeout, a body that is not JSON, a rationale that came back blank — is
caught, attributed, and tallied; the run continues to the next requirement. A
run whose model was having a bad afternoon should yield fewer proposals and a
full account of why, not a stack trace and nothing.

## The taxonomy

Faults are scoped, because the remedy differs. A `response`-scope fault costs
the whole requirement; an `entry`-scope fault costs one candidate and leaves
the other verdicts in the same response standing.

| Rule | Scope | Meaning |
|---|---|---|
| `provider-error` | response | The call itself threw or timed out |
| `invalid-json` | response | Body was not parseable JSON |
| `schema-mismatch` | response / entry | No `verdicts` array; or an entry that is not a usable object |
| `unknown-symbol` | entry | A verdict for a symbol never in this requirement's candidate set |
| `duplicate-symbol` | entry | Two verdicts for the same symbol |
| `missing-verdict` | entry | A submitted candidate the response never ruled on |
| `unknown-classification` | entry | Outside `implements \| supports \| unrelated` |
| `confidence-out-of-range` | entry | Absent, non-numeric, `NaN`/`Infinity`, or outside [0,1] |
| `empty-rationale` | entry | Absent or blank — REQ-CORE-030 AC1 requires all three fields |

`unknown-symbol` and `missing-verdict` are the two that matter most for
evaluation: the first is the model naming code it was never shown, the second
is it declining to answer. Both are invisible to a parser that only checks
whether the JSON is well-formed, and both would otherwise be silently absorbed
as "fewer proposals this run".

## Deliberate boundaries

- **A markdown code fence is not a malformed response.** The model answered
  and wrapped it; the fence is stripped. Counting it as a failure would
  inflate the tally with the one defect that is trivially and losslessly
  recoverable, and the tally exists to measure how often the contract is
  actually broken.
- **A rejected entry still claims its symbol.** A second verdict for a symbol
  whose first was rejected is a `duplicate-symbol`, not a fresh attempt at
  being well-formed — otherwise a response could retry itself into a proposal.
- **A call that returned was billed, whatever the body said.** Usage is
  recorded before parsing (REQ-CORE-032), so a run full of malformed responses
  reports its true cost. Recording usage only for responses that parsed would
  understate the cost of exactly the runs a reader most wants the cost of. A
  call that *threw* is not recorded, having never been billed.

## Raw payload reference

The failure carries `rawResponseRef`, a truncated sha256 of the body, keyed
into the run result's `rawResponses`. A reference rather than the payload
itself so a failure record stays small enough to sit in a report, and so one
response that produced six faults is stored once rather than six times. For a
`provider-error` there is no body, so the error's own message is the payload —
which is the thing a reader debugging that run actually wants.
