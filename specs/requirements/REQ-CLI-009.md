---
id: REQ-CLI-009
title: spectrace evaluate
spec: SPEC-CLI-000
status: implemented
priority: P0
links: []
acceptance_criteria:
  - "`spectrace evaluate retrieval --results <file> --ground-truth <file> [--k <list>]` prints or emits the metrics report with its breakdowns."
  - "`evaluate retrieval` requires no network access, and neither does metric computation anywhere in the command family: `compare` and a `sweep` restricted to lexical mode open no socket."
  - A missing or malformed input file exits 1.
---

# spectrace evaluate

## Statement

Compute evaluation metrics (REQ-CORE-070/071):
`spectrace evaluate retrieval --results <file> --ground-truth <file>
[--k <list>]` prints/emits the metrics report with its breakdowns; requires no
network access; exit 1 on missing or malformed input files.

Two further subcommands serve cross-configuration evaluation:
`evaluate compare --metrics <file>…` aligns already-computed metrics
artifacts into a table and optional figure, and is pure computation;
`evaluate sweep --requirements <dir> --index <file> --ground-truth <file>
[--modes …]` runs each configuration against one index and evaluates each.
`sweep` performs retrieval, so its semantic and hybrid arms transmit and are
gated by REQ-CORE-023 AC3; the network-free guarantee is a property of metric
computation, not of every subcommand.

## Notes

Acceptance criteria decomposed from the statement's own clauses (SPEC-CLI-000
§3); no intent added. The surface-wide criteria in SPEC-CLI-000 §3 apply to
this command as well.

Passing a ground-truth path to this command is explicitly permitted under
CLAUDE.md rule 1; reading back anything beyond aggregate metrics is not.

## AC2 amendment — accepted by BP 2026-08-04

The two subcommands below were added on 2026-08-03 to serve the Phase C gate
("Recall@k table for A and B is report-ready"). `sweep` runs retrieval, so in
semantic or hybrid mode it reaches the network, which collided with AC2 as
originally worded ("the command requires no network access").

**Resolved as recommended:** AC2 is now scoped to `evaluate retrieval` and to
metric computation, and the statement names both subcommands. Nothing in the
metrics path, in `compare`, or in a `sweep` restricted to `--modes lexical`
opens a socket; a transmitting sweep is now additionally gated by
REQ-CORE-023 AC3, so it cannot reach the network without explicit acceptance.
The record below is kept as the reasoning behind the amendment.

Two subcommands were added on 2026-08-03 to serve the Phase C gate
("Recall@k table for A and B is report-ready"):

- `evaluate compare --metrics <file>… [--label <name>…] [--format
  markdown|csv|text] [--chart <file.svg>]` — aligns metrics artifacts across
  configurations into one table, and optionally a Recall@k figure. Pure
  computation over already-computed metrics; no network.
- `evaluate sweep --requirements <dir> --index <file> --ground-truth <file>
  [--modes lexical,semantic,hybrid]` — runs each configuration against one
  index, evaluates each, and writes results, metrics, and comparison
  artifacts. Turns a seven-command evaluation into one.

**This collides with AC2.** `sweep` runs retrieval, so in `semantic` or
`hybrid` mode it reaches the network; AC2 as written says "the command
requires no network access."

The statement's own wording scopes every clause to
`spectrace evaluate retrieval` — the network-free guarantee is about metric
*computation*, which remains true: nothing in the metrics path, in `compare`,
or in a `sweep` restricted to `--modes lexical` opens a socket. The
recommendation — scope AC2 explicitly to `evaluate retrieval` and to metric
computation, and name the two subcommands in the statement — was accepted
unchanged; all three criteria held for `evaluate retrieval` throughout, so
the status never moved.

A partial sweep exits 1 and names what it skipped rather than reporting
success over a subset — the same reasoning as the comparison's `omitted`
list.

Figures are self-contained SVG (no scripts, no external fonts, no network),
so they survive being dropped into a report or a PDF. They carry the
comparison's `omitted` list as footnotes for the same reason the tables do,
and a fourth configuration is dropped with a stated footnote rather than
given a generated hue — the palette seats three at the required
colour-vision separation.
