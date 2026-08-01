---
id: REQ-AUTH-001
title: Expire inactive sessions
status: proposed
priority: high
difficulty: partial-overlap
source_documentation:
  - docs/authentication.md
acceptance_criteria:
  - An authenticated session expires after the configured inactivity period.
  - Activity before the timeout resets the inactivity period.
---

# Expire inactive sessions

## Statement

The system shall expire an authenticated session after the configured period of
inactivity.

## Rationale

Inactive sessions must not remain valid indefinitely.

## Notes

Written from documented behavior before implementation inspection.
