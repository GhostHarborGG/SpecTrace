/**
 * Walking skeleton (setup plan §3.3): pick folder → tree renders → click file
 * → markdown renders. Read-only by design at this stage; editing is
 * REQ-APP-002's other half and lands with CodeMirror in Phase C.
 */
import { useCallback, useState, type JSX } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
// Extensionless: the renderer is bundled by Vite, which does not rewrite
// `.js` specifiers back to `.tsx` the way NodeNext resolution does.
import type { VaultDirectory, VaultSummary } from "../../shared/ipc";

function DirectoryNode({
  directory,
  selected,
  onSelect,
  depth
}: {
  directory: VaultDirectory;
  selected: string | null;
  onSelect: (path: string) => void;
  depth: number;
}): JSX.Element {
  // The root's own name is rendered by the panel header, not as a node.
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
            />
          ))}
          {directory.files.map((file) => (
            <button
              key={file.path}
              className={`file${selected === file.path ? " selected" : ""}`}
              onClick={() => onSelect(file.path)}
            >
              {file.name}
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
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const chooseVault = useCallback(async () => {
    setError(null);
    try {
      const summary = await window.api.chooseVault();
      if (!summary) return; // Picker cancelled.
      setVault(summary);
      setSelected(null);
      setContent("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      if (!vault) return;
      setError(null);
      setSelected(path);
      try {
        setContent(await window.api.readFile(vault.root, path));
      } catch (cause) {
        setContent("");
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [vault]
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
        <span className="badge">read-only</span>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="body">
        <nav className="sidebar">
          {vault ? (
            <>
              <div className="sidebar-header">{vault.tree.name}</div>
              <DirectoryNode directory={vault.tree} selected={selected} onSelect={(p) => void openFile(p)} depth={0} />
            </>
          ) : (
            <p className="empty">No vault open.</p>
          )}
        </nav>

        <main className="preview">
          {selected ? (
            <>
              <div className="preview-path">{selected}</div>
              <article className="markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
              </article>
            </>
          ) : (
            <p className="empty">
              {vault ? "Select a file to preview it." : "Open a vault to browse its specification documents."}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
