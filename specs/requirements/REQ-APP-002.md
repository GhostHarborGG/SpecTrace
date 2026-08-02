---
id: REQ-APP-002
title: Markdown editing with live preview
spec: SPEC-APP-000
status: proposed
priority: P0
rendition: 1
links: []
acceptance_criteria:
  - Round-tripping a file through the editor produces no diff beyond the user's edits.
  - Headings, emphasis, lists, tables, code blocks, and links render in live preview.
  - A raw-source mode is always available per pane.
---

# Markdown editing with live preview

## Statement

The editor shall support CommonMark + GFM (tables, task lists, fenced code)
with an Obsidian-style live preview mode in which formatting renders in place
while remaining editable as markdown.

## Rationale

Editing must feel like Obsidian/Outline, not a plain textarea; this is the
adoption bar.

## Notes

Deliberately still `proposed` after the Phase 3 walking skeleton. Studio does
render CommonMark + GFM through react-markdown, but read-only in a separate
pane — AC2 asks for rendering *in live preview*, which this requirement
defines as formatting rendered in place while remaining editable. No
acceptance criterion holds until the CodeMirror editor lands (setup plan
step 4.2).
