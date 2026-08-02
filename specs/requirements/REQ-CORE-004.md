---
id: REQ-CORE-004
title: Configuration file
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - A missing config produces defaults plus a warning, not a failure.
  - An unknown config key produces a warning naming the key.
  - Parsed configuration is a plain object that survives `structuredClone`; no YAML-specific value types reach a core public API.
---

# Configuration file

## Statement

Per-repository configuration shall live in `.spectrace/config.yaml` (YAML,
carrying a `version` field), covering: specification paths, exclusion patterns
(REQ-CORE-011), retrieval mode and candidate count (REQ-CORE-020…023), model
and embedding settings (REQ-CORE-030…032), and confidence bands
(REQ-CORE-041). All configuration is explicit; the engine shall read no
environment variables directly.

## Notes

Format decided 2026-08-02 (BP): YAML, resolving the open item in the original
wording ("format: YAML or JSON, one chosen and versioned"). Frontmatter is
already YAML, so the vault speaks one configuration language and one parser
serves both; comments are worth having in a file that carries exclusion
patterns and threshold policy. AC3 was added with the decision to hold the
line on CLAUDE.md rule 3 — YAML parsers can yield dates, `Map`s, and
non-cloneable scalars, so the parse boundary must normalize.
