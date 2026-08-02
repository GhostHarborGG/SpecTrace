---
id: REQ-CORE-061
title: Drift categories
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Each injected scenario D1–D5 (proposal Evaluation Plan) is detected as its expected category on the controlled repository.
  - A run with no model access still reports D1, D2, and D5.
---

# Drift categories

## Statement

The engine shall classify drift as: **D1** linked symbol deleted; **D2** linked
symbol suspected renamed; **D3** requirement changed while linked code
unchanged; **D4** linked code changed in possible contradiction of its
requirement; **D5** requirement with no implementation. D1/D2 shall be
determined by symbol resolution with no model call; D3/D4 shall use semantic
judgment via the bounded-candidate model path.

## Notes

The controlled drift scenarios (prelim PQ5) were deferred from Phase A to
Phase F by the 2026-08-02 descope (BP); AC1 is discharged there.
