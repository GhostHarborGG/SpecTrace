/**
 * The coverage dashboard (REQ-APP-020).
 *
 * Renders core's `CoverageReport` — byte-identical to `spectrace coverage
 * --json` at the same commit, because both come from the same builder
 * (NFR-APP-007). Nothing here recomputes a total; the numbers are read, not
 * derived, so the dashboard cannot disagree with the CLI.
 */
import { useCallback, useEffect, useState, type JSX } from "react";
import type { CoverageReport } from "../../shared/ipc";

type Filter = "all" | "linked" | "stale" | "unlinked";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "linked", label: "Linked" },
  { id: "stale", label: "Stale" },
  { id: "unlinked", label: "Unlinked" }
];

export function CoverageDashboard({
  root,
  onOpenRequirement
}: {
  root: string;
  onOpenRequirement: (requirementId: string) => void;
}): JSX.Element {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await window.api.coverage(root));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="error">{error}</div>;
  if (!report) return <p className="empty">{loading ? "Loading coverage…" : "No coverage report."}</p>;

  const { summary } = report;
  const rows = report.requirements.filter((row) => filter === "all" || row.state === filter);
  const pct = summary.total === 0 ? 0 : Math.round((summary.linked / summary.total) * 100);

  return (
    <div className="coverage">
      <div className="coverage-head">
        <div className="tiles">
          {/* AC2: every count is a control — clicking one filters the list
              below to exactly the requirements it counts. */}
          <button className="tile" onClick={() => setFilter("all")}>
            <span className="tile-value">{pct}%</span>
            <span className="tile-label">coverage</span>
          </button>
          <button className="tile" onClick={() => setFilter("linked")}>
            <span className="tile-value">
              {summary.linked}
              <span className="of">/{summary.total}</span>
            </span>
            <span className="tile-label">linked</span>
          </button>
          <button className="tile" onClick={() => setFilter("stale")}>
            <span className="tile-value stale">{summary.stale}</span>
            <span className="tile-label">stale</span>
          </button>
          <button className="tile" onClick={() => setFilter("unlinked")}>
            <span className="tile-value">{summary.unlinked}</span>
            <span className="tile-label">unlinked</span>
          </button>
          <div className="tile">
            <span className="tile-value">{summary.linkTotal}</span>
            <span className="tile-label">links</span>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!report.stalenessChecked && (
        // A dashboard that showed no stale links here would be green over a
        // repository that has moved on. Say what was not checked.
        <p className="notice">
          Links were not resolved against a symbol index, so staleness is unknown — not zero. Run an
          analysis, or <code>spectrace index</code>, to check.
        </p>
      )}

      <div className="filters">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            className={`filter${filter === option.id ? " selected" : ""}`}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">No requirements in this state.</p>
      ) : (
        <table className="coverage-table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>State</th>
              <th className="num">Links</th>
              <th className="num">Broken</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.requirementId}>
                <td>
                  <button className="linkish" onClick={() => onOpenRequirement(row.requirementId)}>
                    {row.requirementId}
                  </button>
                </td>
                <td>
                  <span className={`chip state-${row.state}`}>{row.state}</span>
                </td>
                <td className="num">{row.linkCount}</td>
                <td className={`num${row.brokenLinkCount > 0 ? " bad" : ""}`}>{row.brokenLinkCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="provenance">
        engine {report.engineVersion} · commit <code>{report.repositoryCommit.slice(0, 12)}</code>
      </p>
    </div>
  );
}
