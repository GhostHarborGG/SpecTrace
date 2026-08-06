---
id: REQ-CLI-005
title: spectrace review
spec: SPEC-CLI-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - The interactive loop offers accept, reject, redirect, and skip on each queued proposal, with a source preview.
  - Reviewer identity comes from `--reviewer <name>` or, absent that, from git config; with neither available the command exits 2.
  - "`--decide <file>` applies a JSON decision batch without requiring a TTY."
---

# spectrace review

## Statement

Interactive terminal loop over queued proposals: accept / reject / redirect /
skip, with source preview; `--reviewer <name>` required or taken from git
config; non-interactive `--decide <file>` applies a JSON decision batch
(REQ-CORE-040).

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well — note that `review` without `--decide` is the single
command exempted from the run-non-interactively-in-CI criterion.

Implemented 2026-08-06. Both paths — interactive and batch — collect a set of
decisions and converge on one code path to the audit trail, so there is a
single place where a proposal becomes a decision and a single place where
decisions become links.

## AC1 — the interactive loop

Queues the `suggest` and `review` bands and skips `discard`: withholding the
bottom band is what REQ-CORE-041 asks for, and queueing it anyway would undo
the triage the bands exist to provide. Proposals already carrying a decision
are skipped, so a second pass shows only what is left.

Each item shows the requirement, the symbol, the band, the classification and
confidence, the model's rationale, and a source preview drawn from the symbol
index. The preview needs `--index <file>`; without it the command says the
preview is unavailable and why, rather than rendering a blank where evidence
belongs. `q` stops the loop and applies what was decided up to that point.

**Not covered by an automated test** — it needs a TTY. What *is* tested is the
refusal path: with no terminal and no `--decide`, the command exits 2 and
names the flag. **Human verification is a Phase D gate item for BP**, on the
Phase C precedent where the Studio and figure checks were discharged by eye
rather than by assertion.

## AC2

`--reviewer <name>`, else git `user.name`, else exit 2. Identity is never
inferred from anything looser: a trail that records who *probably* decided is
not an audit trail, and REQ-CORE-040 requires reviewer identity on every
decision.

## AC3

`--decide <file>` takes `{"decisions": [...]}` with `requirementId`,
`symbolId`, and a `kind` of `accept` / `reject` / `redirect` / `skip`, plus an
optional `redirectTo`, `note`, and `timestamp`. Supplying timestamps makes a
batch replay deterministically, which is what lets the tests assert on the
trail.

`skip` is recorded as skipped and never written to the trail — declining to
decide is not a decision, and storing it as one would put a verdict in the
audit record that nobody made. A decision naming a proposal absent from the
artifact is reported the same way rather than failing the batch: the other
decisions in the file are still good.

## What the command writes

The decision trail at `.spectrace/decisions.json` (append-only, REQ-CORE-042),
then accepted links to requirement frontmatter, then the link index at
`.spectrace/index.json` — in that order, per REQ-CORE-050. Documents are
rewritten only when their link list actually changes, so a re-run produces no
diff, and every other frontmatter key survives the rewrite untouched.
