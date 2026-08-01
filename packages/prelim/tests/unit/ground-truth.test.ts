import { describe, expect, it } from "vitest";
import { scaffoldGroundTruth, validateGroundTruth, type GroundTruthFile } from "../../src/evaluation/ground-truth.js";

const context = {
  requirementIds: new Set(["REQ-A-001", "REQ-B-002"]),
  symbolIds: new Set(["ts:src/a.ts#doThing:function", "ts:src/b.ts#Other.method:method"])
};

function validLink(overrides: Partial<GroundTruthFile["links"][number]> = {}) {
  return {
    requirementId: "REQ-A-001",
    symbolId: "ts:src/a.ts#doThing:function",
    labelPass: "independent" as const,
    relationship: "implements" as const,
    confidence: "confirmed" as const,
    rationale: "Directly implements the requirement.",
    ...overrides
  };
}

describe("validateGroundTruth", () => {
  it("accepts a well-formed file with real requirement and symbol references", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: [validLink()]
    };
    expect(validateGroundTruth(file, context)).toEqual([]);
  });

  it("accepts an empty links array (a fresh scaffold)", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: []
    };
    expect(validateGroundTruth(file, context)).toEqual([]);
  });

  it("rejects a non-object payload", () => {
    expect(validateGroundTruth(null, context)).toEqual([
      expect.objectContaining({ code: "not_an_object" })
    ]);
    expect(validateGroundTruth([1, 2, 3], context)).toEqual([
      expect.objectContaining({ code: "not_an_object" })
    ]);
  });

  it("rejects missing top-level metadata", () => {
    const errors = validateGroundTruth({ links: [] }, context);
    const codes = errors.map((e) => e.code);
    expect(codes).toContain("missing_repository_commit");
    expect(codes).toContain("missing_created_at");
    expect(codes).toContain("missing_labeler");
  });

  it("rejects links that isn't an array", () => {
    const errors = validateGroundTruth(
      { repositoryCommit: "x".repeat(40), createdAt: "now", labeler: "x", links: "nope" },
      context
    );
    expect(errors).toEqual([expect.objectContaining({ code: "links_not_array" })]);
  });

  it("rejects a link referencing an unknown requirement or symbol", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: [validLink({ requirementId: "REQ-NOPE", symbolId: "ts:src/nope.ts#nope:function" })]
    };
    const codes = validateGroundTruth(file, context).map((e) => e.code);
    expect(codes).toContain("unknown_requirement_id");
    expect(codes).toContain("unknown_symbol_id");
  });

  it("rejects invalid enum values", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: [
        validLink({
          labelPass: "not_a_pass" as never,
          relationship: "causes" as never,
          confidence: "maybe" as never
        })
      ]
    };
    const codes = validateGroundTruth(file, context).map((e) => e.code);
    expect(codes).toContain("invalid_label_pass");
    expect(codes).toContain("invalid_relationship");
    expect(codes).toContain("invalid_confidence");
  });

  it("rejects a link with an empty rationale", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: [validLink({ rationale: "   " })]
    };
    expect(validateGroundTruth(file, context)).toEqual([expect.objectContaining({ code: "missing_rationale" })]);
  });

  it("rejects an exact duplicate link within the same label pass", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: [validLink(), validLink()]
    };
    const errors = validateGroundTruth(file, context);
    expect(errors).toEqual([expect.objectContaining({ code: "duplicate_link", linkIndex: 1 })]);
  });

  it("allows the same requirement/symbol pair across different label passes", () => {
    const file: GroundTruthFile = {
      repositoryCommit: "a".repeat(40),
      createdAt: new Date().toISOString(),
      labeler: "Brian Parker",
      links: [validLink({ labelPass: "independent" }), validLink({ labelPass: "candidate_review" })]
    };
    expect(validateGroundTruth(file, context)).toEqual([]);
  });
});

describe("scaffoldGroundTruth", () => {
  it("produces a valid, empty skeleton", () => {
    const file = scaffoldGroundTruth({ repositoryCommit: "a".repeat(40), labeler: "Brian Parker" });
    expect(file.links).toEqual([]);
    expect(file.labeler).toBe("Brian Parker");
    expect(validateGroundTruth(file, context)).toEqual([]);
  });
});
