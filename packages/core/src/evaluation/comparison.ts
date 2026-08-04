/**
 * Cross-configuration comparison of retrieval metrics (REQ-CORE-070 support;
 * build-plan Phase C, "config-driven A/B runs, per-stratum reporting").
 *
 * `evaluateRetrieval` answers "how did this configuration do"; this answers
 * "which configuration did better, and where" — the question the Phase C gate
 * actually asks, since a single configuration's Recall@k in isolation decides
 * nothing.
 *
 * The work is alignment, not arithmetic: two reports are only comparable if
 * they were computed over the same k values and the same strata, and reports
 * that disagree are the normal case rather than an exceptional one (a
 * configuration can be evaluated with different `--k`, or over a requirement
 * set with a stratum the other lacks). Rather than silently intersecting and
 * presenting the remainder as if it were the whole picture, the comparison
 * carries what it had to drop — a table that quietly omits a stratum reads as
 * "we measured everything" when it did not.
 *
 * Pure data shaping. Rendering — Markdown, CSV, charts — belongs to the
 * clients; the engine emits no presentation (CLAUDE.md rule 2).
 */

import type { RetrievalMetricsReport } from "./retrieval-metrics.js";

export const METRICS_COMPARISON_ARTIFACT = "spectrace.metrics-comparison";
export const METRICS_COMPARISON_VERSION = 1;

export interface ConfigurationRun {
  /** Full configuration identifier from the run's provenance (REQ-CORE-063). */
  configurationId: string;
  /** Short column heading for report tables; defaults to the configuration ID. */
  label?: string;
  report: RetrievalMetricsReport;
}

export interface ComparisonCell {
  configurationId: string;
  label: string;
  /** Absent when this configuration's report has no row for the stratum. */
  recallAtK?: Record<string, number>;
  hitAtK?: Record<string, number>;
  meanReciprocalRank?: number;
  requirementCount?: number;
}

export interface ComparisonRow {
  /** Breakdown label: `overall`, a difficulty stratum, or a label-pass row. */
  stratum: string;
  cells: ComparisonCell[];
  /** Configuration labels with the highest Recall at the largest shared k; more than one on a tie. */
  bestByRecall: string[];
}

export interface MetricsComparison {
  artifact: typeof METRICS_COMPARISON_ARTIFACT;
  version: number;
  /** k values every configuration reported. */
  ks: number[];
  configurations: { configurationId: string; label: string }[];
  rows: ComparisonRow[];
  /** What alignment had to discard, so a reader is never shown a partial table as a whole one. */
  omitted: ComparisonOmission[];
}

export type ComparisonOmissionRule = "unshared-k" | "unshared-stratum";

export interface ComparisonOmission {
  rule: ComparisonOmissionRule;
  message: string;
  /** The k or stratum dropped. */
  value: string;
  /** Configuration labels that did report it. */
  reportedBy: string[];
}

export class ComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonError";
  }
}

/**
 * Aligns several configurations' metrics reports into one table.
 *
 * Rows appear in the order the first configuration reported them, since that
 * order is already meaningful — `overall` first, then difficulty strata in
 * stratum order, then the label-pass rows (see `evaluateRetrieval`).
 */
export function compareMetricsReports(runs: readonly ConfigurationRun[]): MetricsComparison {
  if (runs.length === 0) {
    throw new ComparisonError("A comparison needs at least one configuration.");
  }

  const configurations = runs.map((run) => ({
    configurationId: run.configurationId,
    label: run.label ?? run.configurationId
  }));

  const duplicateLabel = configurations
    .map((c) => c.label)
    .find((label, i, all) => all.indexOf(label) !== i);
  if (duplicateLabel !== undefined) {
    throw new ComparisonError(
      `Two configurations share the label "${duplicateLabel}"; labels are how columns are told apart.`
    );
  }

  const omitted: ComparisonOmission[] = [];

  // k values every configuration reported, in the first one's order.
  const sharedKs = runs[0]!.report.ks.filter((k) => runs.every((run) => run.report.ks.includes(k)));
  const allKs = [...new Set(runs.flatMap((run) => run.report.ks))].sort((a, b) => a - b);
  for (const k of allKs) {
    if (sharedKs.includes(k)) continue;
    omitted.push({
      rule: "unshared-k",
      value: String(k),
      message: `k=${k} is not reported by every configuration, so it cannot be compared.`,
      reportedBy: runs.filter((run) => run.report.ks.includes(k)).map((_, i) => configurations[i]!.label)
    });
  }
  if (sharedKs.length === 0) {
    throw new ComparisonError("These configurations share no k value; there is nothing to compare.");
  }

  const strataInOrder: string[] = [];
  for (const run of runs) {
    for (const breakdown of run.report.breakdowns) {
      if (!strataInOrder.includes(breakdown.label)) strataInOrder.push(breakdown.label);
    }
  }

  const largestSharedK = String(sharedKs[sharedKs.length - 1]);
  const rows: ComparisonRow[] = [];

  for (const stratum of strataInOrder) {
    const reportedBy = runs
      .map((run, i) => (run.report.breakdowns.some((b) => b.label === stratum) ? configurations[i]!.label : null))
      .filter((label): label is string => label !== null);

    if (reportedBy.length !== runs.length) {
      omitted.push({
        rule: "unshared-stratum",
        value: stratum,
        message: `Stratum "${stratum}" is missing from ${runs.length - reportedBy.length} configuration(s); its row is partial.`,
        reportedBy
      });
    }

    const cells: ComparisonCell[] = runs.map((run, i) => {
      const breakdown = run.report.breakdowns.find((b) => b.label === stratum);
      const configuration = configurations[i]!;
      if (breakdown === undefined) {
        return { configurationId: configuration.configurationId, label: configuration.label };
      }
      const pick = (source: Record<string, number>): Record<string, number> => {
        const kept: Record<string, number> = {};
        for (const k of sharedKs) kept[String(k)] = source[String(k)] ?? 0;
        return kept;
      };
      return {
        configurationId: configuration.configurationId,
        label: configuration.label,
        recallAtK: pick(breakdown.recallAtK),
        hitAtK: pick(breakdown.hitAtK),
        meanReciprocalRank: breakdown.meanReciprocalRank,
        requirementCount: breakdown.requirementCount
      };
    });

    const scored = cells.filter((cell) => cell.recallAtK !== undefined);
    const best = scored.reduce(
      (max, cell) => Math.max(max, cell.recallAtK![largestSharedK] ?? 0),
      Number.NEGATIVE_INFINITY
    );
    const bestByRecall =
      scored.length === 0
        ? []
        : scored.filter((cell) => (cell.recallAtK![largestSharedK] ?? 0) === best).map((cell) => cell.label);

    rows.push({ stratum, cells, bestByRecall });
  }

  return {
    artifact: METRICS_COMPARISON_ARTIFACT,
    version: METRICS_COMPARISON_VERSION,
    ks: sharedKs,
    configurations,
    rows,
    omitted
  };
}

export function serializeMetricsComparison(comparison: MetricsComparison): string {
  return `${JSON.stringify(comparison, null, 2)}\n`;
}
