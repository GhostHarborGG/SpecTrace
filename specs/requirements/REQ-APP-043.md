---
id: REQ-APP-043
title: Run provenance
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Any proposal or warning in the UI can reveal its full provenance record in one action.
  - Two runs under different model snapshots are stored and displayed as distinct result sets.
  - JSON exports validate against a versioned provenance schema shared with the CLI.
---

# Run provenance

## Statement

The application shall attach a provenance record — repository commit SHA, core
version, retrieval configuration, model snapshot identifier, prompt version,
and confidence bands — to every proposal, drift warning, and generated report,
display it on demand in the UI, and include it in all JSON exports; re-runs
shall be diffed against prior proposals rather than silently replacing them.

## Rationale

The proposal commits to reporting every result with the commit, tool
configuration, model snapshot, and prompt version that produced it; Studio
must preserve that discipline or its results are not comparable to the CLI's
or to each other.

## Notes

AC3's shared schema is the artifact envelope from REQ-CORE-071.
