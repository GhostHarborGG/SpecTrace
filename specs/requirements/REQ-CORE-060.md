---
id: REQ-CORE-060
title: Git-aware incremental scoping
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - A commit touching one linked symbol re-evaluates only links to that symbol.
  - Incremental and full analysis at the same commit pair reach consistent conclusions on the shared link set.
---

# Git-aware incremental scoping

## Statement

Given two commits, the engine shall compute the set of links whose linked
symbols or requirement documents were affected by the intervening changes, and
re-evaluate only that set; a full re-analysis mode shall also be invokable,
with both modes reporting links evaluated, runtime, and token usage.

## Rationale

Proposal Step 6 and RQ4: re-evaluate only links affected by a change.
