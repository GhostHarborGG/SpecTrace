---
id: REQ-APP-010
title: Connect a GitHub repository (read-only)
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - A token with write scope is rejected with an explanation.
  - Connection state (repo, branch, last-synced commit SHA) is visible in the UI at all times.
  - Tokens are stored in the OS keychain, never in the vault.
---

# Connect a GitHub repository (read-only)

## Statement

The application shall connect a vault to one GitHub repository using a
fine-grained personal access token with read-only contents permission,
validate the token's scope on entry, and refuse tokens with write
permissions.

## Rationale

The repo connection is the product's differentiator; read-only scope keeps the
security story trivial.

## Notes

Descoped to R1.1 (2026-08-11, BP; recorded in the build plan's Phase D
gate note). REQ-APP-015 covers the capstone's need — a vault analyzing a
local codebase — and fixed the decisions this requirement inherits:
artifacts live with the vault and the code source is read-only by
construction, so the GitHub cache arrives as another read-only
`repositoryRoot`.
