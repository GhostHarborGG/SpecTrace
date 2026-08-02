---
id: REQ-APP-021
title: Drift surfacing
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Each of the five drift scenarios from the CLI evaluation (D1–D5), injected into the connected repo, produces a warning of the correct category after sync.
  - Dismissing a warning suppresses it for that link+commit pair only; new commits re-evaluate.
  - Deterministic categories (delete/rename) surface without any LLM call or cost.
---

# Drift surfacing

## Statement

After each sync, the application shall run the core's git-aware incremental
drift analysis over affected links and surface warnings in three places: a
vault-level drift inbox, inline banners on affected requirement documents, and
badges in the file tree; each warning shall show the drift category (deleted
symbol, suspected rename, requirement changed, suspected semantic
contradiction, unimplemented requirement), confidence, rationale, and the
implicated commits, and shall be confirmable or dismissible with an audit
record.

## Rationale

"Spec–code drift detection" is the other half of development status; warnings
must land where the reader already is.
