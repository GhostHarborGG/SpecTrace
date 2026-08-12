/**
 * The analysis run surface (REQ-APP-012 AC2/AC3).
 *
 * Shows per-stage progress, the cost projected *before* the model stage and
 * the cost measured *after* it, and a cancel control. The two cost figures are
 * deliberately shown side by side and never collapsed into one: the estimate
 * is a projection with a budgeted output allowance, the measured figure is
 * what the provider reported (REQ-CORE-032), and presenting either as the
 * other would misrepresent a number people spend money against.
 */
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { RunProgress, RunResult } from "../../shared/ipc";

const STAGES = ["index", "retrieve", "estimate", "rank"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  index: "Index",
  retrieve: "Retrieve",
  estimate: "Estimate",
  rank: "Rank"
};

/** Four decimal places: ranking runs are routinely fractions of a cent. */
function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function RunPanel({
  root,
  repositoryRoot
}: {
  root: string;
  /** The linked code repository (REQ-APP-015); undefined, the vault is the repository. */
  repositoryRoot: string | undefined;
}): JSX.Element {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Map<Stage, RunProgress>>(new Map());
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // The subscription outlives any single run, so a progress event that arrives
  // between renders is not dropped.
  const unsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => {
    unsubscribe.current = window.api.onRunProgress((event) => {
      setProgress((previous) => new Map(previous).set(event.stage as Stage, event));
    });
    return () => unsubscribe.current?.();
  }, []);

  const start = useCallback(async () => {
    setRunning(true);
    setCancelling(false);
    setError(null);
    setResult(null);
    setProgress(new Map());
    try {
      setResult(
        await window.api.runAnalysis({
          root,
          ...(repositoryRoot === undefined ? {} : { repositoryRoot })
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }, [root, repositoryRoot]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    // False means there was nothing to cancel — worth distinguishing from
    // "cancelled successfully", so the button does not lie about what it did.
    const had = await window.api.cancelAnalysis();
    if (!had) setCancelling(false);
  }, []);

  const projection = result?.projection;
  const measured = result?.usage?.run;

  return (
    <div className="run">
      <div className="run-controls">
        <button className="primary" onClick={() => void start()} disabled={running}>
          {running ? "Running…" : "Run analysis"}
        </button>
        <button onClick={() => void cancel()} disabled={!running || cancelling}>
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
        {result?.cancelled && (
          <span className="badge bad">
            cancelled during {result.cancelledDuring}
          </span>
        )}
        {result && !result.cancelled && <span className="badge ok">complete</span>}
      </div>

      {error && <div className="error">{error}</div>}

      <ol className="stages">
        {STAGES.map((stage) => {
          const event = progress.get(stage);
          const done = event !== undefined && event.completed >= event.total;
          const pct = event && event.total > 0 ? (event.completed / event.total) * 100 : 0;
          return (
            <li key={stage} className={`stage${event ? (done ? " done" : " active") : ""}`}>
              <div className="stage-head">
                <span className="stage-name">{STAGE_LABELS[stage]}</span>
                {event && (
                  <span className="stage-detail">
                    {event.detail ?? `${event.completed}/${event.total}`}
                  </span>
                )}
              </div>
              <div className="meter" role="progressbar" aria-valuenow={Math.round(pct)}>
                <div className="meter-fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="cost">
        <section>
          <h3>Estimated</h3>
          {projection ? (
            <>
              <p className="figure">{projection.priced ? usd(projection.estimatedCostUsd) : "unpriced"}</p>
              <p className="sub">
                {projection.calls} call{projection.calls === 1 ? "" : "s"} ·{" "}
                {projection.inputTokens.toLocaleString()} in ·{" "}
                {projection.outputTokens.toLocaleString()} out
              </p>
              {!projection.priced && (
                // An unpriced run is not a free one. Saying so beats showing $0.
                <p className="sub warn">No pricing configured — tokens counted, cost unknown.</p>
              )}
            </>
          ) : (
            <p className="empty">Shown before the model stage begins.</p>
          )}
        </section>
        <section>
          <h3>Measured</h3>
          {measured ? (
            <>
              <p className="figure">{usd(measured.estimatedCostUsd)}</p>
              <p className="sub">
                {measured.calls} call{measured.calls === 1 ? "" : "s"} ·{" "}
                {measured.inputTokens.toLocaleString()} in ·{" "}
                {measured.outputTokens.toLocaleString()} out
              </p>
            </>
          ) : (
            <p className="empty">
              {result && !result.usage
                ? "No model configured — the run stopped after retrieval."
                : "Reported by the provider after ranking."}
            </p>
          )}
        </section>
      </div>

      {result && (
        <div className="run-summary">
          {result.proposalCount !== undefined && (
            <p>
              <strong>{result.proposalCount}</strong> proposal
              {result.proposalCount === 1 ? "" : "s"}
              {result.bandCounts && (
                <>
                  {" — "}
                  <span className="chip band-suggest">{result.bandCounts.suggest} suggest</span>{" "}
                  <span className="chip band-review">{result.bandCounts.review} review</span>{" "}
                  <span className="chip band-discard">{result.bandCounts.discard} discard</span>
                </>
              )}
            </p>
          )}
          <h3>Artifacts written</h3>
          {result.artifactsWritten.length === 0 ? (
            // AC3: cancelling before the first checkpoint legitimately writes
            // nothing, and saying so is better than an empty list.
            <p className="empty">Nothing was written — the run stopped before the first checkpoint.</p>
          ) : (
            <ul className="artifacts">
              {result.artifactsWritten.map((artifact) => (
                <li key={artifact}>
                  <code>{artifact}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
