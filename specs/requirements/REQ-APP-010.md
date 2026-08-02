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
