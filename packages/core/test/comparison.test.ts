import { describe, expect, it } from "vitest";
import {
  ComparisonError,
  METRICS_COMPARISON_ARTIFACT,
  METRICS_COMPARISON_VERSION,
  compareMetricsReports,
  serializeMetricsComparison,
  type ConfigurationRun
} from "../src/evaluation/comparison.js";
import type { RetrievalMetricsBreakdown, RetrievalMetricsReport } from "../src/evaluation/retrieval-metrics.js";

const KS = [1, 5];

function breakdown(label: string, recallAt5: number, n = 12): RetrievalMetricsBreakdown {
  return {
    label,
    requirementCount: n,
    requirementsWithoutGroundTruth: [],
    recallAtK: { "1": recallAt5 / 2, "5": recallAt5 },
    hitAtK: { "1": recallAt5 * 50, "5": recallAt5 * 100 },
    meanReciprocalRank: recallAt5 * 0.7
  };
}

function report(recallAt5: number, labels = ["overall", "high-overlap"]): RetrievalMetricsReport {
  return { ks: [...KS], breakdowns: labels.map((label) => breakdown(label, recallAt5)) };
}

const A: ConfigurationRun = { configurationId: "bm25f-v5", label: "A", report: report(0.75) };
const B: ConfigurationRun = { configurationId: "embed-v1:m", label: "B", report: report(0.6) };
const C: ConfigurationRun = { configurationId: "hybrid(rrf-v1;k=60)[bm25f-v5+embed-v1:m]", label: "C", report: report(0.82) };

describe("compareMetricsReports — alignment", () => {
  it("puts one column per configuration and one row per stratum", () => {
    const comparison = compareMetricsReports([A, B, C]);
    expect(comparison.artifact).toBe(METRICS_COMPARISON_ARTIFACT);
    expect(comparison.version).toBe(METRICS_COMPARISON_VERSION);
    expect(comparison.configurations.map((c) => c.label)).toEqual(["A", "B", "C"]);
    expect(comparison.rows.map((r) => r.stratum)).toEqual(["overall", "high-overlap"]);
    expect(comparison.rows[0]!.cells.map((c) => c.label)).toEqual(["A", "B", "C"]);
  });

  it("keeps the row order of the first report, which is already meaningful", () => {
    const ordered: ConfigurationRun = {
      configurationId: "x",
      label: "X",
      report: report(0.5, ["overall", "high-overlap", "domain-vocabulary"])
    };
    expect(compareMetricsReports([ordered]).rows.map((r) => r.stratum)).toEqual([
      "overall",
      "high-overlap",
      "domain-vocabulary"
    ]);
  });

  it("names the leader at the largest shared k", () => {
    expect(compareMetricsReports([A, B, C]).rows[0]!.bestByRecall).toEqual(["C"]);
  });

  it("names every configuration on a tie rather than picking one", () => {
    const tied: ConfigurationRun = { configurationId: "other", label: "B", report: report(0.75) };
    expect(compareMetricsReports([A, tied]).rows[0]!.bestByRecall).toEqual(["A", "B"]);
  });

  it("defaults a column heading to the configuration ID", () => {
    const unlabeled: ConfigurationRun = { configurationId: "bm25f-v5", report: report(0.75) };
    expect(compareMetricsReports([unlabeled]).configurations[0]!.label).toBe("bm25f-v5");
  });

  it("returns structuredClone-safe data (CLAUDE.md rule 3)", () => {
    const comparison = compareMetricsReports([A, B]);
    expect(structuredClone(comparison)).toEqual(comparison);
  });
});

describe("compareMetricsReports — what it had to drop is reported, never silently omitted", () => {
  it("compares only shared k values and records the rest", () => {
    const wide: ConfigurationRun = {
      configurationId: "wide",
      label: "wide",
      report: { ks: [1, 5, 10], breakdowns: [{ ...breakdown("overall", 0.7), recallAtK: { "1": 0.3, "5": 0.7, "10": 0.9 }, hitAtK: { "1": 30, "5": 70, "10": 90 } }] }
    };
    const comparison = compareMetricsReports([A, wide]);
    expect(comparison.ks).toEqual([1, 5]);
    const omission = comparison.omitted.find((o) => o.rule === "unshared-k");
    expect(omission?.value).toBe("10");
    expect(omission?.message).toContain("cannot be compared");
  });

  it("keeps a stratum only one configuration reported, and marks the row partial", () => {
    const extra: ConfigurationRun = {
      configurationId: "extra",
      label: "extra",
      report: report(0.6, ["overall", "high-overlap", "domain-vocabulary"])
    };
    const comparison = compareMetricsReports([A, extra]);
    const row = comparison.rows.find((r) => r.stratum === "domain-vocabulary")!;
    expect(row.cells[0]!.recallAtK).toBeUndefined();
    expect(row.cells[1]!.recallAtK).toBeDefined();
    expect(comparison.omitted.some((o) => o.rule === "unshared-stratum" && o.value === "domain-vocabulary")).toBe(true);
  });

  it("ranks a partial row among the configurations that reported it", () => {
    const extra: ConfigurationRun = {
      configurationId: "extra",
      label: "extra",
      report: report(0.6, ["overall", "domain-vocabulary"])
    };
    const row = compareMetricsReports([A, extra]).rows.find((r) => r.stratum === "domain-vocabulary")!;
    expect(row.bestByRecall).toEqual(["extra"]);
  });

  it("has nothing to report when the reports align exactly", () => {
    expect(compareMetricsReports([A, B]).omitted).toEqual([]);
  });
});

describe("compareMetricsReports — refusals", () => {
  it("refuses an empty comparison", () => {
    expect(() => compareMetricsReports([])).toThrow(ComparisonError);
  });

  it("refuses duplicate labels, since labels are how columns are told apart", () => {
    expect(() => compareMetricsReports([A, { ...B, label: "A" }])).toThrow(/share the label/);
  });

  it("refuses reports with no k in common rather than producing an empty table", () => {
    const disjoint: ConfigurationRun = {
      configurationId: "d",
      label: "D",
      report: { ks: [3], breakdowns: [breakdown("overall", 0.5)] }
    };
    expect(() => compareMetricsReports([A, disjoint])).toThrow(/share no k value/);
  });
});

describe("serializeMetricsComparison", () => {
  it("is stable and carries no timestamp", () => {
    const text = serializeMetricsComparison(compareMetricsReports([A, B, C]));
    expect(serializeMetricsComparison(compareMetricsReports([A, B, C]))).toBe(text);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(text).artifact).toBe(METRICS_COMPARISON_ARTIFACT);
  });
});
