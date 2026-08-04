---
id: REQ-APP-002
title: Markdown editing with live preview
spec: SPEC-APP-000
status: partial
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

The CodeMirror 6 editor landed 2026-08-03 (`renderer/src/Editor.tsx`),
replacing the read-only react-markdown pane.

**AC1 holds, and holds structurally rather than by testing.** Live preview is
implemented as CodeMirror decorations over the source text, not as a rendered
model that is serialized back. There is only ever one representation of the
document — the text itself — so there is no reproduction step in which a
round-trip could lose anything. An editor that renders to a model and
serializes back has to *reproduce* markdown, and lossless markdown
reproduction is exactly what goes wrong in practice.

**AC3 holds:** a per-pane toggle turns the decorations off, leaving the raw
buffer.

**AC2 does not hold yet.** Headings, emphasis, strikethrough, inline code,
links, and blockquotes render in place, with their syntax marks hidden unless
the caret is inside the construct. Tables and fenced code blocks do not — they
remain as source text with syntax colouring. Status is `partial` until they
render in place too.
