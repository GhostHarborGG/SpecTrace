import { describe, expect, it } from "vitest";
import {
  ArtifactFormatError,
  evaluateRetrieval,
  parseRetrievalResults,
  serializeMetricsReport,
  serializeRetrievalResults,
  type CandidateSet,
  type GroundTruthFile,
  type RunProvenance
} from "../src/index.js";

const provenance: RunProvenance = {
  repositoryCommit: "abc123",
  configurationId: "bm25f-v3",
  engineVersion: "0.1.0"
};

const sets: CandidateSet[] = [
  {
    requirementId: "R-1",
    configurationId: "bm25f-v3",
    repositoryCommit: "abc123",
    candidates: [
      { rank: 1, symbolId: "src/a.ts::fn", score: 2.5 },
      { rank: 2, symbolId: "src/b.ts::gn", score: 1.25 }
    ]
  },
  { requirementId: "R-2", configurationId: "bm25f-v3", repositoryCommit: "abc123", candidates: [] }
];

describe("results artifact — REQ-CORE-071 AC1 (identical inputs, identical artifacts)", () => {
  it("serializes deterministically with no timestamps", () => {
    const a = serializeRetrievalResults(sets, provenance);
    const b = serializeRetrievalResults(sets, provenance);
    expect(a).toBe(b);
    expect(a).not.toMatch(/timestamp|createdAt|generatedAt/i);
  });

  it("serializes metrics reports deterministically", () => {
    const groundTruth: GroundTruthFile = {
      repositoryCommit: "abc123",
      createdAt: "2026-08-01T00:00:00Z",
      labeler: "BP",
      links: [
        {
          requirementId: "R-1",
          symbolId: "src/a.ts::fn",
          labelPass: "independent",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "test"
        }
      ]
    };
    const report = evaluateRetrieval({ results: sets, groundTruth, requirements: [{ id: "R-1" }, { id: "R-2" }] });
    expect(serializeMetricsReport(report, provenance)).toBe(serializeMetricsReport(report, provenance));
  });
});

describe("results artifact — REQ-CORE-071 AC2 (round-trip)", () => {
  it("parse(serialize(x)) returns the same results and provenance", () => {
    const parsed = parseRetrievalResults(serializeRetrievalResults(sets, provenance));
    expect(parsed.provenance).toEqual(provenance);
    expect(parsed.results).toEqual(sets);
  });

  it("metrics from a persisted artifact equal metrics computed in memory", () => {
    const groundTruth: GroundTruthFile = {
      repositoryCommit: "abc123",
      createdAt: "2026-08-01T00:00:00Z",
      labeler: "BP",
      links: [
        {
          requirementId: "R-1",
          symbolId: "src/b.ts::gn",
          labelPass: "independent",
          relationship: "implements",
          confidence: "confirmed",
          rationale: "test"
        }
      ]
    };
    const requirements = [{ id: "R-1" }, { id: "R-2" }];
    const fromMemory = evaluateRetrieval({ results: sets, groundTruth, requirements });
    const fromArtifact = evaluateRetrieval({
      results: parseRetrievalResults(serializeRetrievalResults(sets, provenance)).results,
      groundTruth,
      requirements
    });
    expect(fromArtifact).toEqual(fromMemory);
  });
});

describe("results artifact — compatibility and errors", () => {
  it("reads headerless Phase A files with null provenance", () => {
    const legacy = sets.map((s) => JSON.stringify(s)).join("\n") + "\n";
    const parsed = parseRetrievalResults(legacy);
    expect(parsed.provenance).toBeNull();
    expect(parsed.results).toEqual(sets);
  });

  it("rejects unsupported artifact versions", () => {
    const text = serializeRetrievalResults(sets, provenance).replace('"version":1', '"version":99');
    expect(() => parseRetrievalResults(text)).toThrow(ArtifactFormatError);
  });

  it("rejects records that are not candidate sets", () => {
    expect(() => parseRetrievalResults('{"nope":true}\n')).toThrow(ArtifactFormatError);
  });

  it("rejects invalid JSON lines with a line number", () => {
    expect(() => parseRetrievalResults('{"requirementId":"R-1","candidates":[]}\nnot json\n')).toThrow(/Line 2/);
  });
});
