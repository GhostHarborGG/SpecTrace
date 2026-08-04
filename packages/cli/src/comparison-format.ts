/**
 * Report-ready rendering of a cross-configuration metrics comparison.
 *
 * Presentation lives here rather than in core, which emits no formatting of
 * any kind (CLAUDE.md rule 2). Core aligns the numbers; this turns them into
 * something that can be pasted into the evaluation report.
 *
 * Every renderer reproduces the comparison's `omitted` list. A table that
 * quietly drops an unshared k or stratum reads as "we measured everything"
 * when it did not, and that is exactly the claim an evaluation report must
 * not make by accident.
 */

import type { MetricsComparison } from "@spectrace/core";

export type ComparisonFormat = "markdown" | "csv" | "text";

export const COMPARISON_FORMATS: readonly ComparisonFormat[] = ["markdown", "csv", "text"];

const recall = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(3));
const percent = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(1));

/** Markdown table per metric, configurations as columns — the shape a report wants. */
export function renderComparisonMarkdown(comparison: MetricsComparison): string {
  const lines: string[] = [];
  const labels = comparison.configurations.map((c) => c.label);

  lines.push("### Retrieval configurations compared");
  lines.push("");
  lines.push("| Configuration | Identifier |");
  lines.push("|---|---|");
  for (const configuration of comparison.configurations) {
    lines.push(`| ${configuration.label} | \`${configuration.configurationId}\` |`);
  }

  for (const k of comparison.ks) {
    lines.push("");
    lines.push(`#### Recall@${k}`);
    lines.push("");
    lines.push(`| Stratum | n | ${labels.join(" | ")} |`);
    lines.push(`|---|---|${labels.map(() => "---").join("|")}|`);
    for (const row of comparison.rows) {
      const n = row.cells.find((cell) => cell.requirementCount !== undefined)?.requirementCount ?? "—";
      const cells = row.cells.map((cell) => {
        const value = recall(cell.recallAtK?.[String(k)]);
        // Bold the leader only on the k the comparison ranked by, so a bold
        // cell always means the same thing.
        return k === comparison.ks[comparison.ks.length - 1] && row.bestByRecall.includes(cell.label)
          ? `**${value}**`
          : value;
      });
      lines.push(`| ${row.stratum} | ${n} | ${cells.join(" | ")} |`);
    }
  }

  lines.push("");
  lines.push("#### Hit% and MRR");
  lines.push("");
  const largestK = comparison.ks[comparison.ks.length - 1];
  lines.push(`| Stratum | ${labels.map((l) => `${l} Hit@${largestK}`).join(" | ")} | ${labels.map((l) => `${l} MRR`).join(" | ")} |`);
  lines.push(`|---|${labels.map(() => "---").join("|")}|${labels.map(() => "---").join("|")}|`);
  for (const row of comparison.rows) {
    const hits = row.cells.map((cell) => percent(cell.hitAtK?.[String(largestK)]));
    const mrrs = row.cells.map((cell) => recall(cell.meanReciprocalRank));
    lines.push(`| ${row.stratum} | ${hits.join(" | ")} | ${mrrs.join(" | ")} |`);
  }

  if (comparison.omitted.length > 0) {
    lines.push("");
    lines.push("#### Not compared");
    lines.push("");
    for (const omission of comparison.omitted) {
      lines.push(`- ${omission.message} Reported by: ${omission.reportedBy.join(", ") || "none"}.`);
    }
  }

  return lines.join("\n") + "\n";
}

/** One row per (stratum, configuration), so a spreadsheet can pivot it any way. */
export function renderComparisonCsv(comparison: MetricsComparison): string {
  const header = [
    "stratum",
    "configuration",
    "configuration_id",
    "requirements",
    ...comparison.ks.map((k) => `recall_at_${k}`),
    ...comparison.ks.map((k) => `hit_at_${k}`),
    "mrr"
  ];

  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  const rows = [header.join(",")];

  for (const row of comparison.rows) {
    for (const cell of row.cells) {
      rows.push(
        [
          escape(row.stratum),
          escape(cell.label),
          escape(cell.configurationId),
          cell.requirementCount === undefined ? "" : String(cell.requirementCount),
          ...comparison.ks.map((k) => (cell.recallAtK?.[String(k)] ?? "").toString()),
          ...comparison.ks.map((k) => (cell.hitAtK?.[String(k)] ?? "").toString()),
          cell.meanReciprocalRank === undefined ? "" : String(cell.meanReciprocalRank)
        ].join(",")
      );
    }
  }

  // A CSV cannot carry a footnote, so omissions become explicit comment rows
  // rather than vanishing.
  for (const omission of comparison.omitted) {
    rows.push(`# not compared,${escape(omission.rule)},${escape(omission.value)},${escape(omission.message)}`);
  }

  return rows.join("\n") + "\n";
}

/** Compact terminal view. */
export function renderComparisonText(comparison: MetricsComparison): string {
  const lines: string[] = [];
  const width = Math.max(12, ...comparison.rows.map((r) => r.stratum.length));

  for (const configuration of comparison.configurations) {
    lines.push(`${configuration.label}  ${configuration.configurationId}`);
  }

  for (const k of comparison.ks) {
    lines.push("");
    lines.push(`Recall@${k}`);
    lines.push(
      `  ${"stratum".padEnd(width)}  ${comparison.configurations.map((c) => c.label.padStart(8)).join("  ")}`
    );
    for (const row of comparison.rows) {
      const cells = row.cells.map((cell) => recall(cell.recallAtK?.[String(k)]).padStart(8));
      lines.push(`  ${row.stratum.padEnd(width)}  ${cells.join("  ")}`);
    }
  }

  if (comparison.omitted.length > 0) {
    lines.push("");
    lines.push("not compared:");
    for (const omission of comparison.omitted) lines.push(`  ${omission.message}`);
  }

  return lines.join("\n") + "\n";
}

export function renderComparison(comparison: MetricsComparison, format: ComparisonFormat): string {
  if (format === "markdown") return renderComparisonMarkdown(comparison);
  if (format === "csv") return renderComparisonCsv(comparison);
  return renderComparisonText(comparison);
}
