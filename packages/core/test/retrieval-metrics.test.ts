import { describe, expect, it } from "vitest";
import {
  evaluateRetrieval,
  DEFAULT_METRIC_KS,
  type GroundTruthFile,
  type ScoredResult
} from "../src/index.js";

function groundTruth(links: GroundTruthFile["links"]): GroundTruthFile {
  return { repositoryCommit: "abc123", createdAt: "2026-08-01T00:00:00Z", labeler: "BP", links };
}

function link(
  requirementId: string,
  symbolId: string,
  overrides: Partial<GroundTruthFile["links"][number]> = {}
): GroundTruthFile["links"][number] {
  return {
    requirementId,
    symbolId,
    labelPass: "independent",
    relationship: "implements",
    confidence: "confirmed",
    rationale: "test",
    ...overrides
  };
}

function results(...sets: [string, string[]][]): ScoredResult[] {
  return sets.map(([requirementId, symbolIds]) => ({
    requirementId,
    candidates: symbolIds.map((symbolId, i) => ({ rank: i + 1, symbolId }))
  }));
}

const overall = (report: ReturnType<typeof evaluateRetrieval>) =>
  report.breakdowns.find((b) => b.label === "overall")!;

describe("evaluateRetrieval — REQ-CORE-070 AC1 (default ks, zero reciprocal rank)", () => {
  it("defaults to k ∈ {1, 3, 5, 10}", () => {
    const report = evaluateRetrieval({
      results: results(["R-1", ["s1"]]),
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }]
    });
    expect(report.ks).toEqual([...DEFAULT_METRIC_KS]);
    expect(Object.keys(overall(report).recallAtK)).toEqual(["1", "3", "5", "10"]);
  });

  it("contributes reciprocal rank 0 when no relevant symbol is retained", () => {
    const report = evaluateRetrieval({
      results: results(["R-1", ["wrong-a", "wrong-b"]], ["R-2", ["s2"]]),
      groundTruth: groundTruth([link("R-1", "missing"), link("R-2", "s2")]),
      requirements: [{ id: "R-1" }, { id: "R-2" }]
    });
    // R-1 contributes 0, R-2 contributes 1/1 → MRR 0.5 over the two scored requirements.
    expect(overall(report).meanReciprocalRank).toBeCloseTo(0.5, 10);
  });

  it("computes Recall@k and Hit@k on a known case", () => {
    // R-1 has 2 relevant symbols; one retrieved at rank 2.
    const report = evaluateRetrieval({
      results: results(["R-1", ["noise", "s1", "more-noise"]]),
      groundTruth: groundTruth([link("R-1", "s1"), link("R-1", "s2")]),
      requirements: [{ id: "R-1" }],
      ks: [1, 3]
    });
    const b = overall(report);
    expect(b.recallAtK["1"]).toBe(0);
    expect(b.recallAtK["3"]).toBeCloseTo(0.5, 10);
    expect(b.hitAtK["1"]).toBe(0);
    expect(b.hitAtK["3"]).toBe(100);
    expect(b.meanReciprocalRank).toBeCloseTo(0.5, 10);
  });

  it("excludes requirements with no ground truth from averages and enumerates them", () => {
    const report = evaluateRetrieval({
      results: results(["R-1", ["s1"]], ["R-2", ["s9"]]),
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }, { id: "R-2" }]
    });
    const b = overall(report);
    expect(b.requirementCount).toBe(1);
    expect(b.requirementsWithoutGroundTruth).toEqual(["R-2"]);
    // If R-2 were silently scored as zero this would be 0.5.
    expect(b.recallAtK["1"]).toBe(1);
  });
});

describe("evaluateRetrieval — REQ-CORE-070 AC2 (implements-only, label passes)", () => {
  it("never counts supports links as relevant", () => {
    const report = evaluateRetrieval({
      results: results(["R-1", ["s1"]]),
      groundTruth: groundTruth([link("R-1", "s1", { relationship: "supports" })]),
      requirements: [{ id: "R-1" }]
    });
    // The only link is `supports`, so R-1 has no ground truth at all.
    expect(overall(report).requirementsWithoutGroundTruth).toEqual(["R-1"]);
  });

  it("counts candidate_review links only in the combined breakdown", () => {
    const report = evaluateRetrieval({
      results: results(["R-1", ["s1", "s2"]]),
      groundTruth: groundTruth([link("R-1", "s1"), link("R-1", "s2", { labelPass: "candidate_review" })]),
      requirements: [{ id: "R-1" }]
    });
    const independent = report.breakdowns.find((b) => b.label === "independent-only")!;
    const combined = report.breakdowns.find((b) => b.label === "independent-plus-candidate-review")!;
    expect(independent.recallAtK["3"]).toBe(1); // 1 of 1 independent link found
    expect(combined.recallAtK["3"]).toBe(1); // 2 of 2 combined links found
    expect(combined.recallAtK["1"]).toBeCloseTo(0.5, 10); // only s1 within k=1
  });

  it("reports a difficulty row per distinct label present, in stratum order", () => {
    const report = evaluateRetrieval({
      results: results(["R-1", ["s1"]], ["R-2", ["s2"]], ["R-3", ["s3"]]),
      groundTruth: groundTruth([link("R-1", "s1"), link("R-2", "s2"), link("R-3", "s3")]),
      requirements: [
        { id: "R-1", difficulty: "domain-vocabulary" },
        { id: "R-2", difficulty: "high-overlap" },
        { id: "R-3" }
      ]
    });
    expect(report.breakdowns.map((b) => b.label)).toEqual([
      "overall",
      "high-overlap",
      "domain-vocabulary",
      "independent-only",
      "independent-plus-candidate-review"
    ]);
    expect(report.breakdowns.find((b) => b.label === "high-overlap")!.requirementCount).toBe(1);
  });
});

describe("evaluateRetrieval — REQ-CORE-070 AC3 (deterministic, structuredClone-safe)", () => {
  const params = {
    results: results(["R-1", ["s1", "s2"]], ["R-2", ["s3"]]),
    groundTruth: groundTruth([link("R-1", "s2"), link("R-2", "missing")]),
    requirements: [
      { id: "R-1", difficulty: "partial-overlap" },
      { id: "R-2", difficulty: "high-overlap" }
    ]
  };

  it("returns identical reports for identical inputs", () => {
    expect(evaluateRetrieval(params)).toEqual(evaluateRetrieval(params));
  });

  it("survives structuredClone", () => {
    const report = evaluateRetrieval(params);
    expect(structuredClone(report)).toEqual(report);
  });
});
