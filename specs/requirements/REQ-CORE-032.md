---
id: REQ-CORE-032
title: Usage accounting
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - Run summary totals equal the sum of per-call records.
---

# Usage accounting

## Statement

Every model and embedding call shall record input tokens, output tokens, and
estimated cost; per-run and per-requirement totals shall be reported.
