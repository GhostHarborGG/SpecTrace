/**
 * The review queue (REQ-APP-013).
 *
 * Keyboard triage is the point: `a`/`r`/`d`/`s` accept, reject, redirect, and
 * skip, `j`/`k` or the arrows move, and nothing needs the mouse. The same four
 * verbs `spectrace review` offers, because they are the decision kinds
 * REQ-CORE-040 defines — not because the terminal happened to pick them.
 *
 * Decisions accumulate locally and are written in one batch. That is what lets
 * triage run at keyboard speed without a disk write between keystrokes, and it
 * keeps the audit trail's timestamps describing when the reviewer decided
 * rather than when React re-rendered.
 *
 * A skip is recorded as skipped, never as a rejection: declining to decide is
 * not a decision, and storing it as one would put a verdict in the trail that
 * nobody made.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { QueueEntry, QueueSnapshot, ReviewOutcome } from "../../shared/ipc";

type Verdict = "accept" | "reject" | "redirect" | "skip";

const VERDICT_KEYS: Record<string, Verdict> = {
  a: "accept",
  r: "reject",
  d: "redirect",
  s: "skip"
};

export function ReviewQueue({
  root,
  repositoryRoot
}: {
  root: string;
  /** The linked code repository (REQ-APP-015); undefined, the vault is the repository. */
  repositoryRoot: string | undefined;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [cursor, setCursor] = useState(0);
  const [verdicts, setVerdicts] = useState<Map<string, { kind: Verdict; redirectTo?: string }>>(new Map());
  const [reviewer, setReviewer] = useState<string>("");
  const [reviewerKnown, setReviewerKnown] = useState(true);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redirectInput = useRef<HTMLInputElement | null>(null);
  const [redirecting, setRedirecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await window.api.reviewQueue(root, repositoryRoot);
      setSnapshot(next);
      setCursor(0);
      setVerdicts(new Map());
      setOutcome(null);
      const name = await window.api.defaultReviewer(root);
      setReviewerKnown(name !== null);
      setReviewer(name ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [root, repositoryRoot]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => snapshot?.entries ?? [], [snapshot]);
  const key = (entry: QueueEntry): string => `${entry.proposal.requirementId} ${entry.proposal.symbolId}`;
  const current = entries[cursor];

  const decide = useCallback(
    (verdict: Verdict, redirectTo?: string) => {
      if (!current) return;
      setVerdicts((previous) => {
        const next = new Map(previous);
        next.set(key(current), redirectTo === undefined ? { kind: verdict } : { kind: verdict, redirectTo });
        return next;
      });
      setRedirecting(null);
      setCursor((c) => Math.min(c + 1, entries.length - 1));
    },
    [current, entries.length]
  );

  // Keyboard triage. Suspended while the redirect field has focus, so typing a
  // symbol ID containing "a" or "s" does not decide the proposal underneath.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (redirecting !== null) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((c) => Math.min(c + 1, entries.length - 1));
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }
      const verdict = VERDICT_KEYS[event.key.toLowerCase()];
      if (verdict === undefined) return;
      event.preventDefault();
      if (verdict === "redirect") {
        if (current) setRedirecting(key(current));
        return;
      }
      decide(verdict);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, entries.length, redirecting, current]);

  useEffect(() => {
    if (redirecting !== null) redirectInput.current?.focus();
  }, [redirecting]);

  const submit = useCallback(async () => {
    if (verdicts.size === 0 || reviewer.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.applyDecisions({
        root,
        ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
        reviewer: reviewer.trim(),
        decisions: [...verdicts.entries()].map(([composite, verdict]) => {
          const [requirementId, symbolId] = composite.split(" ") as [string, string];
          return {
            requirementId,
            symbolId,
            kind: verdict.kind,
            ...(verdict.redirectTo ? { redirectTo: verdict.redirectTo } : {})
          };
        })
      });
      // Reload first, then publish the outcome: `load` resets it, so setting
      // it beforehand would flash the confirmation and wipe it, leaving the
      // reviewer with no record of what was just written.
      await load();
      setOutcome(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [verdicts, reviewer, root, repositoryRoot, load]);

  if (error) return <div className="error">{error}</div>;
  if (!snapshot) return <p className="empty">Loading queue…</p>;

  if (snapshot.proposalsPath === null) {
    return (
      <p className="empty">
        No proposals artifact yet. Run an analysis with a ranking model configured, and its proposals
        appear here.
      </p>
    );
  }

  return (
    <div className="queue">
      <div className="queue-head">
        <span className="queue-counts">
          <strong>{entries.length}</strong> queued · {snapshot.decided} decided · {snapshot.withheld}{" "}
          withheld in <span className="chip band-discard">discard</span>
        </span>
        <span className="spacer" />
        <label className="reviewer">
          Reviewer
          <input
            value={reviewer}
            placeholder={reviewerKnown ? "" : "required — git user.name is unset"}
            onChange={(e) => setReviewer(e.target.value)}
          />
        </label>
        <button className="primary" onClick={() => void submit()} disabled={busy || verdicts.size === 0 || reviewer.trim().length === 0}>
          {busy ? "Writing…" : `Apply ${verdicts.size} decision${verdicts.size === 1 ? "" : "s"}`}
        </button>
      </div>

      {snapshot.stalenessUnchecked !== null && (
        <p className="notice">
          Staleness not checked: {snapshot.stalenessUnchecked}. Proposals may point at symbols that no
          longer exist.
        </p>
      )}

      {outcome && (
        <div className="outcome">
          {outcome.applied} applied · {outcome.skipped.length} skipped · {outcome.links} accepted link
          {outcome.links === 1 ? "" : "s"} across {outcome.updatedDocuments.length} document
          {outcome.updatedDocuments.length === 1 ? "" : "s"} · override rate{" "}
          {(outcome.statistics.overrideRate * 100).toFixed(1)}%
        </div>
      )}

      {entries.length === 0 ? (
        <p className="empty">Nothing queued for review.</p>
      ) : (
        <div className="queue-body">
          <ul className="queue-list">
            {entries.map((entry, i) => {
              const verdict = verdicts.get(key(entry));
              return (
                <li key={key(entry)}>
                  <button
                    className={`queue-item${i === cursor ? " selected" : ""}`}
                    onClick={() => setCursor(i)}
                  >
                    <span className={`chip band-${entry.band}`}>{entry.band}</span>
                    <span className="queue-req">{entry.proposal.requirementId}</span>
                    <span className="queue-sym">{entry.proposal.symbolId}</span>
                    {entry.stale && <span className="chip stale-chip">stale</span>}
                    {verdict && <span className={`chip verdict-${verdict.kind}`}>{verdict.kind}</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {current && (
            <section className="queue-detail">
              <h2>
                {current.proposal.requirementId} → <code>{current.proposal.symbolId}</code>
              </h2>
              <p className="queue-meta">
                <span className={`chip band-${current.band}`}>{current.band}</span>
                <span className="chip">{current.proposal.classification}</span>
                <span className="chip">confidence {current.proposal.confidence.toFixed(2)}</span>
                <span className="chip">rank {current.proposal.rank}</span>
              </p>

              {current.stale && (
                <p className="notice bad">
                  This symbol is no longer in the index
                  {current.staleReason === "excluded"
                    ? " — an exclusion pattern removed it"
                    : " — it was deleted, renamed, or moved"}
                  . Accepting stores a link that is broken immediately.
                </p>
              )}

              <p className="rationale">{current.proposal.rationale}</p>

              {redirecting === key(current) ? (
                <form
                  className="redirect"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = redirectInput.current?.value.trim() ?? "";
                    if (value.length === 0) {
                      // No target is not a redirect. Skipping is the honest
                      // record of what happened.
                      decide("skip");
                      return;
                    }
                    decide("redirect", value);
                  }}
                >
                  <input ref={redirectInput} placeholder="redirect to symbol ID" />
                  <button type="submit">Redirect</button>
                  <button type="button" onClick={() => setRedirecting(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="verdict-buttons">
                  <button onClick={() => decide("accept")}>Accept <kbd>a</kbd></button>
                  <button onClick={() => decide("reject")}>Reject <kbd>r</kbd></button>
                  <button onClick={() => setRedirecting(key(current))}>Redirect <kbd>d</kbd></button>
                  <button onClick={() => decide("skip")}>Skip <kbd>s</kbd></button>
                </div>
              )}

              <p className="hint">
                <kbd>j</kbd>/<kbd>k</kbd> to move · decisions are held until you apply them
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
