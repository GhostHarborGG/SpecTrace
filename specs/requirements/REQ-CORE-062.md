---
id: REQ-CORE-062
title: Warning content
spec: SPEC-CORE-000
status: proposed
priority: P0
links: []
acceptance_criteria:
  - A dismissed warning does not reappear at the same commit pair; a new commit affecting the link re-evaluates.
---

# Warning content

## Statement

Every drift warning shall identify the changed artifacts, the suspected
inconsistency, a confidence value, a rationale, and the implicated commits,
and shall be confirmable or dismissible with an audit record; dismissal
applies to that link+commit pair only.
