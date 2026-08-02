---
id: REQ-APP-014
title: Bidirectional navigation
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - A requirement's linked-symbols panel opens read-only source at the symbol's current location in the cached SHA.
  - "Symbol search (\"which requirements touch `AuthService.login`?\") returns results in under 500 ms on the controlled repo."
  - Broken links (symbol no longer resolves) are visually distinct, not hidden.
---

# Bidirectional navigation

## Statement

From a requirement document, the application shall list linked code units with
source previews; from any symbol in the symbol index, the application shall
list the requirements linked to it; each direction shall be reachable in one
action from the other.

## Rationale

Navigation is the payoff of every accepted link; both directions must be
first-class.
