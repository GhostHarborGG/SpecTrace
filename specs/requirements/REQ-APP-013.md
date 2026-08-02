---
id: REQ-APP-013
title: Link review queue
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Accepting a proposal writes the link to the requirement's frontmatter and the index, matching CLI storage exactly.
  - Keyboard-only triage (next/accept/reject/redirect) is possible.
  - Redirect allows searching the symbol index and attaching the corrected target.
  - The decision audit record is exportable as JSON.
---

# Link review queue

## Statement

The application shall present proposed links in a review queue grouped by the
core's confidence bands (auto-suggest > 0.75; review 0.50–0.74; discarded
< 0.50 available under a toggle), showing for each proposal the requirement,
candidate symbol with source preview, confidence, and model rationale; the
reviewer shall be able to accept, reject, or redirect each proposal, with
every decision recorded with reviewer, timestamp, and commit SHA.

## Rationale

Human confirmation is the engine's trust model; a GUI queue is where Studio
most improves on the CLI.
