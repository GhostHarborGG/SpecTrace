/**
 * CodeMirror 6 markdown editor (REQ-APP-002).
 *
 * Two modes over one buffer, toggled per pane:
 *
 * - **Live preview** — formatting renders in place while the text stays
 *   editable markdown. Implemented as CodeMirror decorations over the source,
 *   not as a rendered HTML twin, and that choice is what makes AC1
 *   (round-tripping produces no diff beyond the user's edits) true by
 *   construction: there is only ever one representation of the document — the
 *   text itself. An editor that renders to a model and serializes back has to
 *   *reproduce* the markdown, and lossless markdown reproduction is precisely
 *   what goes wrong in practice.
 * - **Source** — the same buffer with the decorations off (AC3).
 *
 * Syntax marks are hidden only while the caret is outside their construct, so
 * the markdown is always reachable by moving the cursor into it. A heading
 * whose `##` is permanently hidden is a heading the user cannot un-make.
 */

import { useEffect, useRef, type JSX } from "react";
import { EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const HEADING_SCALE = ["1.7em", "1.45em", "1.25em", "1.12em", "1.05em", "1em"];

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: HEADING_SCALE[0], fontWeight: "600" },
  { tag: tags.heading2, fontSize: HEADING_SCALE[1], fontWeight: "600" },
  { tag: tags.heading3, fontSize: HEADING_SCALE[2], fontWeight: "600" },
  { tag: tags.heading4, fontSize: HEADING_SCALE[3], fontWeight: "600" },
  { tag: tags.heading5, fontSize: HEADING_SCALE[4], fontWeight: "600" },
  { tag: tags.heading6, fontSize: HEADING_SCALE[5], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--accent)" },
  { tag: tags.monospace, fontFamily: "var(--mono)" },
  { tag: tags.quote, color: "var(--ink-2)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--ink-2)" }
]);

/** Node types whose punctuation is decoration rather than content. */
const HIDEABLE_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "QuoteMark",
  "LinkMark"
]);

const hiddenMark = Decoration.replace({});

/**
 * Hides the syntax marks of every construct the caret is not inside.
 *
 * Exported for tests: this is the whole of live preview's behavior, and it is
 * worth asserting without standing up a DOM.
 */
export function hideableMarkRanges(
  view: EditorView
): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  const selection = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!HIDEABLE_MARKS.has(node.name)) return;
        if (node.from === node.to) return;
        // Test against the parent construct so the caret anywhere in the
        // heading — or the bold run — reveals its marks, not only when it
        // sits precisely on the punctuation.
        const parent = node.node.parent;
        const constructFrom = parent?.from ?? node.from;
        const constructTo = parent?.to ?? node.to;
        if (selection.from <= constructTo && selection.to >= constructFrom) return;
        found.push({ from: node.from, to: node.to });
      }
    });
  }
  return found;
}

/** Decorations depend on the viewport, so they belong in a view plugin. */
const livePreview = (): Extension =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }

      private build(view: EditorView): DecorationSet {
        const marks: Range<Decoration>[] = hideableMarkRanges(view).map((range) =>
          hiddenMark.range(range.from, range.to)
        );
        return Decoration.set(marks, true);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );

export interface EditorProps {
  value: string;
  /** Identity of the open document; a change means "load a different file". */
  documentKey: string;
  onChange: (value: string) => void;
  /** Off = raw source mode (AC3). */
  livePreview: boolean;
  readOnly?: boolean;
}

export function Editor({
  value,
  documentKey,
  onChange,
  livePreview: preview,
  readOnly
}: EditorProps): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  // Held in a ref so the effect below never depends on the callback identity —
  // rebuilding the editor on every render would drop the cursor mid-word.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(highlightStyle),
        EditorView.lineWrapping,
        placeholder("Write markdown…"),
        EditorState.readOnly.of(readOnly === true),
        ...(preview ? [livePreview()] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        })
      ]
    });

    const view = new EditorView({ state, parent });
    return () => view.destroy();
    // Rebuilt only when the open document or the mode changes. `value` is
    // deliberately absent: the editor owns the buffer between document
    // switches, and reseeding it on every keystroke would fight the user for
    // the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, preview, readOnly]);

  return <div className="editor" ref={host} data-testid="editor" />;
}
