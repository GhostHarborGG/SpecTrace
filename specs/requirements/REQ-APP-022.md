---
id: REQ-APP-022
title: Status reporting
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - The markdown report is itself a valid vault document with wiki-links into the requirements it cites.
  - The JSON report is stable-schema'd and versioned for CI or external tooling.
---

# Status reporting

## Statement

The application shall generate a status report (markdown and JSON)
summarizing coverage, open drift warnings by category, review-queue depth, and
deltas since a chosen prior commit or date.

## Rationale

The knowledge base should answer "what's the status of development?" as a
shareable artifact, not only an in-app view.
