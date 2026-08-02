---
id: REQ-APP-030
title: Unified search
spec: SPEC-APP-000
status: proposed
priority: P1
rendition: 1
links: []
acceptance_criteria:
  - Search over a 1,000-file vault returns first results in under 300 ms.
  - Requirement-ID exact matches rank first.
---

# Unified search

## Statement

The application shall provide full-text search across vault documents and
symbol-index metadata from a single search field, with filters for document
type, requirement status, and link state.

## Rationale

A knowledge base that cannot be searched across both halves — prose and symbol
metadata — leaves the reader guessing which half holds the answer.

## Notes

Rationale supplied at extraction time; the product spec block carried none.
Scheduled for rendition 1.1 per the build plan's Phase I notes.
