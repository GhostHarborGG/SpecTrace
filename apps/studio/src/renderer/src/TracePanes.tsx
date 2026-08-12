/**
 * Bidirectional trace navigation (REQ-APP-014, REQ-CORE-051).
 *
 * Both directions come from core's link index over one IPC call:
 * requirement → symbols for the document on screen, and symbol → requirements
 * for whatever the reader looks up. The symbol direction is a lookup rather
 * than a list because the index is keyed by symbol ID and a repository has far
 * more symbols than requirements — rendering all of them would bury the answer.
 */
import { useCallback, useEffect, useState, type JSX } from "react";
import type { TraceNeighbours } from "../../shared/ipc";

export function TracePanes({
  root,
  repositoryRoot,
  requirementId
}: {
  root: string;
  /** The linked code repository (REQ-APP-015); undefined, the vault is the repository. */
  repositoryRoot: string | undefined;
  requirementId: string | null;
}): JSX.Element {
  const [neighbours, setNeighbours] = useState<TraceNeighbours | null>(null);
  const [lookup, setLookup] = useState("");
  const [lookedUp, setLookedUp] = useState<{ symbolId: string; requirements: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await window.api.traceNeighbours(root, requirementId ?? undefined, undefined, repositoryRoot);
        if (!cancelled) setNeighbours(next);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, repositoryRoot, requirementId]);

  const runLookup = useCallback(async () => {
    const symbolId = lookup.trim();
    if (symbolId.length === 0) return;
    setError(null);
    try {
      const result = await window.api.traceNeighbours(root, undefined, symbolId, repositoryRoot);
      setLookedUp({ symbolId, requirements: result.requirements });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [root, repositoryRoot, lookup]);

  const unlinked = neighbours?.unlinked ?? [];
  const isUnlinked = requirementId !== null && unlinked.includes(requirementId);

  return (
    <>
      <section>
        <h2>
          Trace links
          {neighbours && neighbours.symbols.length > 0 && (
            <span className="count">{neighbours.symbols.length}</span>
          )}
        </h2>
        {error && <p className="error-inline">{error}</p>}
        {requirementId === null ? (
          <p className="empty">Not a requirement document.</p>
        ) : neighbours === null ? (
          <p className="empty">Loading…</p>
        ) : neighbours.symbols.length === 0 ? (
          <p className="empty">
            {isUnlinked ? "No accepted links — this requirement is untraced." : "No links yet."}
          </p>
        ) : (
          <ul className="links">
            {neighbours.symbols.map((symbolId) => (
              <li key={symbolId}>
                <button
                  className="linkish mono"
                  title="Look up which requirements share this symbol"
                  onClick={() => {
                    setLookup(symbolId);
                    void window.api
                      .traceNeighbours(root, undefined, symbolId)
                      .then((r) => setLookedUp({ symbolId, requirements: r.requirements }));
                  }}
                >
                  {symbolId}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Symbol → requirements</h2>
        <form
          className="lookup"
          onSubmit={(e) => {
            e.preventDefault();
            void runLookup();
          }}
        >
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="ts:src/file.ts#name:kind"
          />
          <button type="submit">Look up</button>
        </form>
        {lookedUp && (
          <>
            <p className="lookup-target mono">{lookedUp.symbolId}</p>
            {lookedUp.requirements.length === 0 ? (
              <p className="empty">No requirement links to this symbol.</p>
            ) : (
              <ul className="links">
                {lookedUp.requirements.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section>
        <h2>
          Untraced
          {unlinked.length > 0 && <span className="count">{unlinked.length}</span>}
        </h2>
        {unlinked.length === 0 ? (
          <p className="empty">Every requirement has at least one link.</p>
        ) : (
          <ul className="links">
            {unlinked.slice(0, 12).map((id) => (
              <li key={id}>
                <code className={id === requirementId ? "bad" : undefined}>{id}</code>
              </li>
            ))}
            {unlinked.length > 12 && <li className="empty">…and {unlinked.length - 12} more</li>}
          </ul>
        )}
      </section>
    </>
  );
}
