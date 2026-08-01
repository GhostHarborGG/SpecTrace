import { describe, expect, it } from "vitest";
import { evaluateRetrieval } from "../../src/evaluation/retrieval-metrics.js";
import type { RetrievalResult } from "../../src/retrieval/rank.js";
import type { GroundTruthFile } from "../../src/evaluation/ground-truth.js";
import type { ParsedRequirement } from "../../src/requirements/types.js";

function requirement(id: string, difficulty: ParsedRequirement["difficulty"]): ParsedRequirement {
  return {
    filePath: `${id}.md`,
    id,
    title: id,
    status: null,
    priority: null,
    difficulty,
    sourceDocumentation: [],
    acceptanceCriteria: ["something"],
    statement: "something",
    rationale: null,
    notes: null,
    rawBody: ""
  };
}

function result(requirementId: string, symbolIds: string[]): RetrievalResult {
  return {
    requirementId,
    configurationId: "test",
    repositoryCommit: "a".repeat(40),
    candidates: symbolIds.map((symbolId, i) => ({ rank: i + 1, symbolId, score: symbolIds.length - i }))
  };
}

describe("evaluateRetrieval", () => {
  it("computes Recall@k, Hit@k, and MRR by hand-checkable example", () => {
    // REQ-1 (high-overlap): correct symbol at rank 1 -> recall@1=1, hit@1=100%, rr=1
    // REQ-2 (partial-overlap): correct symbol at rank 3 -> recall@1=0, recall@3=1, hit@3=100%, rr=1/3
    // REQ-3 (domain-vocabulary): correct symbol not retrieved at all -> all zero
    const requirements = [
      requirement("REQ-1", "high-overlap"),
      requirement("REQ-2", "partial-overlap"),
      requirement("REQ-3", "domain-vocabulary")
    ];
    const results: RetrievalResult[] = [
      result("REQ-1", ["sym:correct1", "sym:noise1", "sym:noise2"]),
      result("REQ-2", ["sym:noise3", "sym:noise4", "sym:correct2"]),
      result("REQ-3", ["sym:noise5", "sym:noise6"])
    ];
    const groundTruth: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: "now",
      labeler: "test",
      links: [
        {
          requirementId: "REQ-1",
          symbolId: "sym:correct1",
          labelPass: "independent",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "r"
        },
        {
          requirementId: "REQ-2",
          symbolId: "sym:correct2",
          labelPass: "independent",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "r"
        },
        {
          requirementId: "REQ-3",
          symbolId: "sym:correct3-never-retrieved",
          labelPass: "independent",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "r"
        }
      ]
    };

    const report = evaluateRetrieval({ results, groundTruth, requirements, ks: [1, 3] });
    const overall = report.breakdowns.find((b) => b.label === "overall")!;

    expect(overall.requirementCount).toBe(3);
    expect(overall.recallAtK["1"]).toBeCloseTo((1 + 0 + 0) / 3);
    expect(overall.recallAtK["3"]).toBeCloseTo((1 + 1 + 0) / 3);
    expect(overall.hitAtK["1"]).toBeCloseTo(((1 + 0 + 0) / 3) * 100);
    expect(overall.hitAtK["3"]).toBeCloseTo(((1 + 1 + 0) / 3) * 100);
    expect(overall.meanReciprocalRank).toBeCloseTo((1 + 1 / 3 + 0) / 3);
  });

  it("excludes requirements with no ground-truth link from the average instead of scoring them zero", () => {
    const requirements = [requirement("REQ-1", "high-overlap"), requirement("REQ-2", "high-overlap")];
    const results: RetrievalResult[] = [result("REQ-1", ["sym:correct1"]), result("REQ-2", ["sym:something-else"])];
    const groundTruth: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: "now",
      labeler: "test",
      links: [
        {
          requirementId: "REQ-1",
          symbolId: "sym:correct1",
          labelPass: "independent",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "r"
        }
        // REQ-2 intentionally has no ground-truth link at all.
      ]
    };

    const report = evaluateRetrieval({ results, groundTruth, requirements, ks: [1] });
    const overall = report.breakdowns.find((b) => b.label === "overall")!;

    expect(overall.requirementCount).toBe(1);
    expect(overall.requirementsWithoutGroundTruth).toEqual(["REQ-2"]);
    expect(overall.recallAtK["1"]).toBe(1); // perfect, since only REQ-1 (a hit) is averaged
  });

  it("breaks down by difficulty group", () => {
    const requirements = [
      requirement("REQ-H", "high-overlap"),
      requirement("REQ-P", "partial-overlap"),
      requirement("REQ-D", "domain-vocabulary")
    ];
    const results: RetrievalResult[] = [
      result("REQ-H", ["sym:h"]),
      result("REQ-P", ["sym:not-p"]),
      result("REQ-D", ["sym:not-d"])
    ];
    const groundTruth: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: "now",
      labeler: "test",
      links: [
        { requirementId: "REQ-H", symbolId: "sym:h", labelPass: "independent", relationship: "implements", confidence: "confirmed", rationale: "r" },
        { requirementId: "REQ-P", symbolId: "sym:p", labelPass: "independent", relationship: "implements", confidence: "confirmed", rationale: "r" },
        { requirementId: "REQ-D", symbolId: "sym:d", labelPass: "independent", relationship: "implements", confidence: "confirmed", rationale: "r" }
      ]
    };

    const report = evaluateRetrieval({ results, groundTruth, requirements, ks: [1] });
    const byLabel = new Map(report.breakdowns.map((b) => [b.label, b]));

    expect(byLabel.get("high-overlap")!.recallAtK["1"]).toBe(1);
    expect(byLabel.get("partial-overlap")!.recallAtK["1"]).toBe(0);
    expect(byLabel.get("domain-vocabulary")!.recallAtK["1"]).toBe(0);
  });

  it("only counts implements links, and separates independent-only from independent+candidate-review", () => {
    const requirements = [requirement("REQ-1", "high-overlap")];
    const results: RetrievalResult[] = [result("REQ-1", ["sym:candidate-review-only", "sym:supports-only"])];
    const groundTruth: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: "now",
      labeler: "test",
      links: [
        {
          requirementId: "REQ-1",
          symbolId: "sym:supports-only",
          labelPass: "independent",
          relationship: "supports",
          confidence: "confirmed",
          rationale: "r"
        },
        {
          requirementId: "REQ-1",
          symbolId: "sym:candidate-review-only",
          labelPass: "candidate_review",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "r"
        }
      ]
    };

    const report = evaluateRetrieval({ results, groundTruth, requirements, ks: [1] });
    const byLabel = new Map(report.breakdowns.map((b) => [b.label, b]));

    // Only a `supports` link and a `candidate_review` link exist -> independent-only sees no relevant symbols at all.
    expect(byLabel.get("independent-only")!.requirementsWithoutGroundTruth).toEqual(["REQ-1"]);
    // Once candidate-review links are included, REQ-1 has a relevant symbol and it's retrieved at rank 1.
    expect(byLabel.get("independent-plus-candidate-review")!.recallAtK["1"]).toBe(1);
  });
});
