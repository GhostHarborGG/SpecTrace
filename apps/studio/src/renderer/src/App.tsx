/**
 * Studio's editing surface (REQ-APP-001…004).
 *
 * The whole schema half of this screen — what a requirement is, which IDs
 * collide, what a violation reads like — comes from `@spectrace/core` over
 * IPC. Studio renders judgements; it does not make them (SPEC-APP-000 §2).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Editor } from "./Editor";
import type { VaultAnalysis, VaultDirectory, VaultSummary } from "../../shared/ipc";

/**
 * How long after the last keystroke the vault is re-analyzed.
 *
 * REQ-APP-004 AC2 allows 2 s for a duplicate ID to surface; 400 ms leaves
 * room for the analysis itself and still feels immediate. Debounced rather
 * than per-keystroke because analysis reads every file in the vault.
 */
const ANALYSIS_DEBOUNCE_MS = 400;

function DirectoryNode({
  directory,
  selected,
  onSelect,
  depth,
  problemPaths
}: {
  directory: VaultDirectory;
  selected: string | null;
  onSelect: (path: string) => void;
  depth: number;
  problemPaths: ReadonlySet<string>;
}): JSX.Element {
  const [open, setOpen] = useState(true);
  const isRoot = depth === 0;

  return (
    <div className="node">
      {!isRoot && (
        <button className="folder" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="chevron">{open ? "▾" : "▸"}</span>
          {directory.name}
        </button>
      )}
      {open && (
        <div className={isRoot ? undefined : "children"}>
          {directory.directories.map((child) => (
            <DirectoryNode
              key={child.path}
              directory={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
              problemPaths={problemPaths}
            />
          ))}
          {directory.files.map((file) => (
            <button
              key={file.path}
              className={`file${selected === file.path ? " selected" : ""}`}
              onClick={() => onSelect(file.path)}
            >
              {file.name}
              {problemPaths.has(file.path) && (
                <span className="dot" title="Schema violation in this document" aria-label="has violations" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function App(): JSX.Element {
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [analysis, setAnalysis] = useState<VaultAnalysis | null>(null);
  const [preview, setPreview] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = buffer !== savedContent;

  const runAnalysis = useCallback(
    async (root: string, overridePath: string | null, overrideContent: string) => {
      try {
        const next = await window.api.analyzeVault(
          root,
          overridePath === null ? [] : [{ path: overridePath, content: overrideContent }]
        );
        setAnalysis(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    []
  );

  // Re-analyze on a pause in typing, with the unsaved buffer substituted —
  // otherwise the panel would describe the last save rather than the screen,
  // and a duplicate ID would not surface until the file was written.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!vault) return;
    if (debounce.current !== null) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void runAnalysis(vault.root, selected, buffer);
    }, ANALYSIS_DEBOUNCE_MS);
    return () => {
      if (debounce.current !== null) clearTimeout(debounce.current);
    };
  }, [vault, selected, buffer, runAnalysis]);

  const chooseVault = useCallback(async () => {
    setError(null);
    try {
      const summary = await window.api.chooseVault();
      if (!summary) return;
      setVault(summary);
      setSelected(null);
      setBuffer("");
      setSavedContent("");
      setAnalysis(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (!vault) return;
      if (dirty && !window.confirm("Discard unsaved changes?")) return;
      setError(null);
      try {
        const content = await window.api.readFile(vault.root, path);
        setSelected(path);
        setBuffer(content);
        setSavedContent(content);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [vault, dirty]
  );

  const save = useCallback(async () => {
    if (!vault || selected === null || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await window.api.writeFile(vault.root, selected, buffer);
      setSavedContent(buffer);
      // Re-read from disk rather than from the buffer: analysis should now
      // describe the file, and any difference is a bug worth seeing.
      await runAnalysis(vault.root, null, "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [vault, selected, buffer, dirty, runAnalysis]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const documentViolations = useMemo(
    () => (analysis && selected ? analysis.violations.filter((v) => v.path === selected) : []),
    [analysis, selected]
  );

  const problemPaths = useMemo(
    () => new Set((analysis?.violations ?? []).map((v) => v.path)),
    [analysis]
  );

  const requirement = useMemo(
    () => analysis?.requirements.find((r) => r.path === selected) ?? null,
    [analysis, selected]
  );

  const backlinks = useMemo(
    () => (analysis && selected ? analysis.links.filter((l) => l.to === selected && l.from !== selected) : []),
    [analysis, selected]
  );

  const outbound = useMemo(
    () => (analysis && selected ? analysis.links.filter((l) => l.from === selected) : []),
    [analysis, selected]
  );

  return (
    <div className="app">
      <header className="titlebar">
        <button className="primary" onClick={() => void chooseVault()}>
          Open vault…
        </button>
        {vault && (
          <span className="vault-path" title={vault.root}>
            {vault.root} · {vault.fileCount} markdown file{vault.fileCount === 1 ? "" : "s"}
          </span>
        )}
        <span className="spacer" />
        {selected && (
          <>
            <label className="toggle">
              <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
              Live preview
            </label>
            <button onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          </>
        )}
        {analysis && (
          <span className={analysis.violations.length > 0 ? "badge bad" : "badge ok"}>
            {analysis.violations.length === 0
              ? `${analysis.requirements.length} requirements · no violations`
              : `${analysis.violations.length} violation${analysis.violations.length === 1 ? "" : "s"}`}
          </span>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      <div className="body">
        <nav className="sidebar">
          {vault ? (
            <>
              <div className="sidebar-header">{vault.tree.name}</div>
              <DirectoryNode
                directory={vault.tree}
                selected={selected}
                onSelect={(p) => void openFile(p)}
                depth={0}
                problemPaths={problemPaths}
              />
            </>
          ) : (
            <p className="empty">No vault open.</p>
          )}
        </nav>

        <main className="pane">
          {selected ? (
            <>
              <div className="pane-path">
                {selected}
                {dirty && <span className="dirty">●</span>}
              </div>

              {documentViolations.length > 0 && (
                <ul className="violations" aria-label="Schema violations in this document">
                  {documentViolations.map((violation, i) => (
                    <li key={`${violation.rule}-${i}`}>
                      <code>{violation.rule}</code> {violation.message}
                    </li>
                  ))}
                </ul>
              )}

              <Editor
                value={buffer}
                documentKey={selected}
                onChange={setBuffer}
                livePreview={preview}
              />
            </>
          ) : (
            <p className="empty">
              {vault ? "Select a file to open it." : "Open a vault to browse its specification documents."}
            </p>
          )}
        </main>

        {selected && (
          <aside className="inspector">
            {requirement ? (
              <section>
                <h2>Properties</h2>
                <dl className="properties">
                  <dt>ID</dt>
                  <dd>
                    <code>{requirement.id}</code>
                  </dd>
                  <dt>Title</dt>
                  <dd>{requirement.title}</dd>
                  <dt>Status</dt>
                  <dd>
                    <span className={`chip status-${requirement.status}`}>{requirement.status}</span>
                  </dd>
                  <dt>Priority</dt>
                  <dd>
                    <span className="chip">{requirement.priority}</span>
                  </dd>
                </dl>
              </section>
            ) : (
              <section>
                <h2>Properties</h2>
                <p className="empty">Not a requirement document.</p>
              </section>
            )}

            <section>
              <h2>Backlinks{backlinks.length > 0 && <span className="count">{backlinks.length}</span>}</h2>
              {backlinks.length === 0 ? (
                <p className="empty">Nothing links here.</p>
              ) : (
                <ul className="links">
                  {backlinks.map((link, i) => (
                    <li key={`${link.from}-${i}`}>
                      <button className="linkish" onClick={() => void openFile(link.from)}>
                        {link.from}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2>Links out{outbound.length > 0 && <span className="count">{outbound.length}</span>}</h2>
              {outbound.length === 0 ? (
                <p className="empty">No wiki-links in this document.</p>
              ) : (
                <ul className="links">
                  {outbound.map((link, i) => (
                    <li key={`${link.target}-${i}`}>
                      {link.to === null ? (
                        // An unresolved link is the useful signal here — it is
                        // usually a typo or a document not written yet.
                        <span className="unresolved" title="Resolves to nothing in this vault">
                          {link.target}
                        </span>
                      ) : (
                        <button className="linkish" onClick={() => void openFile(link.to!)}>
                          {link.target}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
