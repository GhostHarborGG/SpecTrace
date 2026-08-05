# Phase C — open decisions for BP (all resolved)

Written 2026-08-04 by Claude Code. **Closed out 2026-08-04.** All six items
are resolved; the Phase C gate is closed. Kept as the record of what was
decided and why — the build plan carries the gate-closure note, and each
requirement file carries its own reasoning.

| # | Item | Resolution |
|---|---|---|
| 1 | Transmission log under-reports in semantic/hybrid mode | **Fixed** (BP instruction). REQ-CORE-023 AC2; log artifact v2 |
| 2 | Scope of REQ-CORE-023 — does "a model" mean the ranker only? | **"A model" means any model, embeddings included** (BP delegated). REQ-CORE-023 AC3 + consent gate |
| 3 | Default retrieval mode — A, B, or C? | **A** (BP) |
| 4 | REQ-CLI-009 AC2 collision with `evaluate sweep` | **Amended as recommended** (BP) |
| 5 | Verify Studio by eye | **Verified by BP** — gate criterion met |
| 6 | Look at the SVG figures | **Verified by BP** |

---

## 1. Transmission log under-reporting — fixed

`analyze --dry-run --transmission-log <file>` reported the bounded candidate
payload and said nothing about semantic mode having already sent every symbol
in the repository to the embedding API, so NFR-CORE-005 held in Configuration
A and not in B or C.

The log now carries a mandatory `retrieval` section: the mode, and where a
model was involved, its identity, dimensions, the corpus-wide symbol and query
text counts, and the split between texts sent over the network and texts
served from cache. `auditTransmissionLog` gained `undisclosed-embedding`,
`unexpected-embedding`, and `mode-mismatch`, and a `disclosed` result kept
independent of `bounded` — the defect was a perfectly bounded payload beside
total silence about the corpus, so collapsing the two would have hidden it.

## 2. Scope of REQ-CORE-023 — resolved as "any model"

The two readings were (a) "a model" means the ranking model of SPEC-CORE-000
§6, and (b) it means any model including embeddings. **(b), decided on three
grounds:** BP's own usage of "model" is LLM-general and never meant the
ranking stage specifically, so (a) was never the plain sense; the stated
rationale ("cost proportional to requirements, not repository size") is
violated by corpus-wide embedding whichever kind of model receives the texts,
and a reading under which a requirement's own rationale does not apply is
motivated reasoning; and NFR-CORE-005 is a privacy requirement, which does not
turn on model architecture.

So Configuration B was in violation as written. The statement now names B and
C as an explicit exception carrying three conditions — never the default,
disclosed before it happens, refused without explicit acceptance — and the
consent gate makes the third real: selecting `retrieval.mode: semantic` does
not on its own tell an operator that the whole repository is about to leave.

Decision 3 keeping A as the default is what holds the exception narrow: the
tool as shipped transmits nothing during retrieval, and reaching the exception
takes two deliberate acts rather than one.

## 3. Default retrieval mode — A

Overall figures on the frozen `hookable` corpus (n = 12, 4 per stratum):

| | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| A lexical `bm25f-v5` | .250 | .708 | .750 | .917 | .515 |
| B semantic `text-embedding-3-small` | .625 | .792 | **1.000** | 1.000 | .774 |
| C hybrid `rrf-v1` | .625 | .792 | .875 | 1.000 | **.794** |
| C hybrid `weighted-v1` | .583 | **.833** | .875 | 1.000 | .750 |

`retrieval.topK` defaults to 10, so R@10 is the operating point, and there the
gap is one requirement out of twelve. Hybrid does not beat semantic. At n = 12
one requirement is 0.083 overall, so only the lexical-vs-semantic gap is large
enough to report as a finding.

**A ships as the default (BP).** B is reported as evidence that the
retrieval-first bet clears its bar — a separate claim from what ships.

## 4. REQ-CLI-009 AC2 — amended

AC2 is scoped to `evaluate retrieval` and to metric computation; `compare` and
`sweep` are named in the statement. A transmitting sweep is additionally gated
by REQ-CORE-023 AC3.

## 5 & 6. Human verification — done

BP ran Studio and confirmed the live duplicate-ID flag, and reviewed the SVG
figures. Both were gate criteria that no amount of passing tests could
discharge.

---

## Still carried, not gate-blocking

- **`--dry-run` may still reach the network** in semantic/hybrid mode. It can
  no longer do so silently — AC3's gate applies — but making the flag imply
  cache-only would change the runtime contract, not just the report, so it is
  BP's call.
- **Consent is per-run**, via `--accept-corpus-transmission`. A repo-level
  config key was considered and deliberately not added: a flag keeps the
  consent visible in every recorded command line, which matters for the
  evaluation record.
- REQ-CORE-011 AC2 and REQ-CLI-004's cost estimate wait on Phase D;
  REQ-APP-001…004 remain `partial` with each file naming what holds.
