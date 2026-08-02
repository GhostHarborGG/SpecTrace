---
id: REQ-APP-011
title: Repository sync and local cache
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Two analysis runs against the same SHA produce identical indexes with zero API calls on the second run.
  - Sync of a 5,000-file repository delta completes without exceeding GitHub secondary rate limits.
  - The UI shows cache size and offers cache eviction per repository.
---

# Repository sync and local cache

## Statement

The application shall mirror the connected repository's tracked source files
into a local cache keyed by commit SHA, syncing on demand and on a
configurable interval, honoring the core's exclusion configuration
(generated/vendored/minified paths), and shall run all indexing against the
cache.

## Rationale

Analysis must be reproducible and rate-limit-safe (AD-3); the API is a
transport, not a data store.
