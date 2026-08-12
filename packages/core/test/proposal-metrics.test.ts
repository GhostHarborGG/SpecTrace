import { describe, expect, it } from "vitest";
import { evaluateProposals, type EvaluatedProposal, type GroundTruthFile } from "../src/index.js";

/**
 * REQ-CLI-009 AC4, core half: precision/recall/F1 for a ranked proposal set,
 * aggregate-only by construction.
 */

const BANDS = { suggest: 0.8, review: 0.5 };

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

function proposal(
  requirementId: string,
  symbolId: string,
  overrides: Partial<EvaluatedProposal> = {}
): EvaluatedProposal {
  return { requirementId, symbolId, classification: "implements", confidence: 0.9, ...overrides };
}

const overall = (report: ReturnType<typeof evaluateProposals>) =>
  report.breakdowns.find((b) => b.label === "overall")!;

describe("evaluateProposals — the predicted and relevant sets", () => {
  it("scores a perfect run as precision 1, recall 1, F1 1", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1"), proposal("R-2", "s2")],
      groundTruth: groundTruth([link("R-1", "s1"), link("R-2", "s2")]),
      requirements: [{ id: "R-1" }, { id: "R-2" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({
      predicted: 2,
      relevant: 2,
      truePositives: 2,
      precision: 1,
      recall: 1,
      f1: 1
    });
  });

  it("counts a wrong proposal against precision and a missed link against recall", () => {
    const report = evaluateProposals({
      // One right, one wrong; the ground truth holds a second link never proposed.
      proposals: [proposal("R-1", "s1"), proposal("R-1", "s-wrong")],
      groundTruth: groundTruth([link("R-1", "s1"), link("R-1", "s2")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({ predicted: 2, relevant: 2, truePositives: 1 });
    expect(overall(report).precision).toBeCloseTo(0.5);
    expect(overall(report).recall).toBeCloseTo(0.5);
    expect(overall(report).f1).toBeCloseTo(0.5);
  });

  it("only `implements` proposals predict links; `supports` and `unrelated` never do", () => {
    const report = evaluateProposals({
      proposals: [
        proposal("R-1", "s1", { classification: "supports" }),
        proposal("R-1", "s2", { classification: "unrelated" })
      ],
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({ predicted: 0, truePositives: 0, precision: 0 });
  });

  it("only `implements` ground-truth links are relevant (REQ-CORE-070 AC2's rule)", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1")],
      groundTruth: groundTruth([link("R-1", "s1", { relationship: "supports" })]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    // The proposal has no relevant counterpart: a false positive, not a hit.
    expect(overall(report)).toMatchObject({ predicted: 1, relevant: 0, truePositives: 0, recall: 0 });
  });

  it("deduplicates repeated pairs rather than counting them twice", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1"), proposal("R-1", "s1", { confidence: 0.85 })],
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({ predicted: 1, truePositives: 1, precision: 1 });
  });

  it("zero denominators report 0 with the counts alongside, never NaN", () => {
    const report = evaluateProposals({
      proposals: [],
      groundTruth: groundTruth([]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({ predicted: 0, relevant: 0, precision: 0, recall: 0, f1: 0 });
    expect(Number.isNaN(overall(report).f1)).toBe(false);
  });
});

describe("evaluateProposals — band cutoffs from the run's own thresholds", () => {
  it("a discard-band proposal predicts nothing in any row", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1", { confidence: 0.2 })],
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    for (const row of report.breakdowns) expect(row.predicted).toBe(0);
  });

  it("suggest-only excludes review-band proposals that overall includes", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1", { confidence: 0.9 }), proposal("R-1", "s2", { confidence: 0.6 })],
      groundTruth: groundTruth([link("R-1", "s1"), link("R-1", "s2")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({ predicted: 2, truePositives: 2 });
    const suggestOnly = report.breakdowns.find((b) => b.label === "suggest-only")!;
    expect(suggestOnly).toMatchObject({ predicted: 1, truePositives: 1 });
    expect(suggestOnly.recall).toBeCloseTo(0.5);
  });
});

describe("evaluateProposals — breakdown rows mirror evaluateRetrieval's", () => {
  it("reports overall, per-difficulty, suggest-only, and both-passes rows in order", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1")],
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [
        { id: "R-1", difficulty: "partial-overlap" },
        { id: "R-2", difficulty: "high-overlap" }
      ],
      bands: BANDS
    });
    expect(report.breakdowns.map((b) => b.label)).toEqual([
      "overall",
      "high-overlap",
      "partial-overlap",
      "suggest-only",
      "independent-plus-candidate-review"
    ]);
  });

  it("candidate_review links count only in the both-passes row", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1"), proposal("R-1", "s2")],
      groundTruth: groundTruth([link("R-1", "s1"), link("R-1", "s2", { labelPass: "candidate_review" })]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(overall(report)).toMatchObject({ relevant: 1, truePositives: 1 });
    expect(overall(report).precision).toBeCloseTo(0.5);
    const both = report.breakdowns.find((b) => b.label === "independent-plus-candidate-review")!;
    expect(both).toMatchObject({ relevant: 2, truePositives: 2, precision: 1, recall: 1 });
  });

  it("a difficulty row scopes both proposals and links to its stratum", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1"), proposal("R-2", "s-wrong")],
      groundTruth: groundTruth([link("R-1", "s1"), link("R-2", "s2")]),
      requirements: [
        { id: "R-1", difficulty: "high-overlap" },
        { id: "R-2", difficulty: "domain-vocabulary" }
      ],
      bands: BANDS
    });
    const high = report.breakdowns.find((b) => b.label === "high-overlap")!;
    expect(high).toMatchObject({ requirementCount: 1, predicted: 1, relevant: 1, truePositives: 1, precision: 1 });
    const domain = report.breakdowns.find((b) => b.label === "domain-vocabulary")!;
    expect(domain).toMatchObject({ requirementCount: 1, predicted: 1, relevant: 1, truePositives: 0, precision: 0 });
  });
});

describe("evaluateProposals — the blinding wall (CLAUDE.md rule 1)", () => {
  it("emits no requirement ID and no symbol ID anywhere in the report", () => {
    const report = evaluateProposals({
      proposals: [proposal("REQ-SECRET-001", "ts:src/secret.ts#hidden:function")],
      groundTruth: groundTruth([link("REQ-SECRET-001", "ts:src/secret.ts#hidden:function")]),
      requirements: [{ id: "REQ-SECRET-001" }, { id: "REQ-SECRET-002" }],
      bands: BANDS
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("REQ-SECRET");
    expect(serialized).not.toContain("secret.ts");
    // Requirements lacking ground truth are counted, never named.
    expect(overall(report).requirementsWithoutGroundTruthCount).toBe(1);
  });

  it("counts out-of-scope proposals so a subset run cannot read as full coverage", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1"), proposal("R-UNKNOWN", "s9")],
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(report.proposalsOutsideScope).toBe(1);
    expect(overall(report)).toMatchObject({ predicted: 1 });
  });

  it("survives structuredClone (REQ-CORE-070 AC3's rule, rule 3)", () => {
    const report = evaluateProposals({
      proposals: [proposal("R-1", "s1")],
      groundTruth: groundTruth([link("R-1", "s1")]),
      requirements: [{ id: "R-1" }],
      bands: BANDS
    });
    expect(structuredClone(report)).toEqual(report);
  });
});
