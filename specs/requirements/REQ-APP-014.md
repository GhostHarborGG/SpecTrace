---
id: REQ-APP-014
title: Bidirectional navigation
spec: SPEC-APP-000
status: partial
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

## Notes

**No criterion fully holds; the panels exist.** Status is `partial`.

`apps/studio/src/renderer/src/TracePanes.tsx` renders both directions from
core's link index over one IPC call (REQ-CORE-051): a requirement's linked
symbols, a symbol → requirements lookup, and the untraced list.

**AC1 does not hold.** The linked-symbols panel lists symbol IDs; it does not
open read-only source at the symbol's location. That needs source text at a
known SHA, which is REQ-APP-011's cache — deliberately not built yet.

**AC2 is unverified.** The lookup returns results from an in-memory index and
is expected to be far inside 500 ms, but no measurement has been taken on the
controlled repository, so the criterion is not claimed.

**AC3 does not hold.** Broken links are not visually distinct in these panes.
The data exists — `resolveLinks` reports them and the coverage report carries
`brokenLinks` — but the panes do not consume it. This is the criterion most
worth closing next: it is the one that makes the difference between a link
list and a traceability tool.
