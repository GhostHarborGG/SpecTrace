import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCERPT_BUDGET,
  TRANSMISSION_LOG_ARTIFACT,
  TRANSMISSION_LOG_VERSION,
  UnresolvedCandidateError,
  auditTransmissionLog,
  buildTransmissionUnits,
  serializeTransmissionLog,
  type TransmissionLog
} from "../src/transmission/bounded-payload.js";
import type { CandidateSet } from "../src/retrieval/retrieve.js";
import type { CodeSymbol } from "../src/indexer/types.js";

const COMMIT = "a".repeat(40);

function symbol(n: number, overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    symbolId: `src/mod.ts#sym${n}`,
    kind: "function",
    name: `sym${n}`,
    qualifiedName: `sym${n}`,
    relativePath: "src/mod.ts",
    startLine: n,
    endLine: n + 4,
    signature: `function sym${n}(): void`,
    documentation: `Does thing ${n}.`,
    normalizedSource: `function sym${n}() { return ${n}; }`,
    exported: true,
    repositoryCommit: COMMIT,
    ...overrides
  };
}

/** `count` symbols, and a candidate set retrieving all of them for `requirementId`. */
function run(requirementId: string, count: number): { symbols: CodeSymbol[]; set: CandidateSet } {
  const symbols = Array.from({ length: count }, (_, i) => symbol(i + 1));
  return {
    symbols,
    set: {
      requirementId,
      configurationId: "bm25f-v5",
      repositoryCommit: COMMIT,
      candidates: symbols.map((s, i) => ({ rank: i + 1, symbolId: s.symbolId, score: 1 - i / 100 }))
    }
  };
}

function logOf(units: TransmissionLog["units"], topK: number): TransmissionLog {
  return {
    artifact: TRANSMISSION_LOG_ARTIFACT,
    version: TRANSMISSION_LOG_VERSION,
    topK,
    repositoryCommit: COMMIT,
    configurationId: "bm25f-v5",
    engineVersion: "0.1.0",
    units
  };
}

describe("buildTransmissionUnits — the bound (REQ-CORE-023)", () => {
  it("transmits the requirement text and at most k candidate excerpts", () => {
    const { symbols, set } = run("R-1", 20);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "The system shall do a thing."]]),
      candidateSets: [set],
      symbols,
      topK: 5
    });

    expect(units).toHaveLength(1);
    expect(units[0]!.requirementText).toBe("The system shall do a thing.");
    expect(units[0]!.candidates).toHaveLength(5);
    expect(units[0]!.candidates.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("carries only indexed symbol fields — no repository content beyond the candidate set", () => {
    const { symbols, set } = run("R-1", 3);
    const [unit] = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 3
    });

    for (const excerpt of unit!.candidates) {
      expect(Object.keys(excerpt).sort()).toEqual([
        "documentation",
        "endLine",
        "kind",
        "qualifiedName",
        "rank",
        "relativePath",
        "signature",
        "source",
        "startLine",
        "symbolId"
      ]);
      const indexed = symbols.find((s) => s.symbolId === excerpt.symbolId)!;
      expect(excerpt.source).toBe(indexed.normalizedSource);
    }
  });

  it("records a requirement with no candidates rather than omitting it", () => {
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [
        { requirementId: "R-1", configurationId: "bm25f-v5", repositoryCommit: COMMIT, candidates: [] }
      ],
      symbols: [],
      topK: 5
    });
    expect(units).toHaveLength(1);
    expect(units[0]!.candidates).toEqual([]);
  });

  it("bounds every field so payload size cannot depend on one large file", () => {
    const huge = symbol(1, {
      signature: "s".repeat(5000),
      documentation: "d".repeat(5000),
      normalizedSource: "x".repeat(5000)
    });
    const [unit] = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "t".repeat(9000)]]),
      candidateSets: [
        {
          requirementId: "R-1",
          configurationId: "bm25f-v5",
          repositoryCommit: COMMIT,
          candidates: [{ rank: 1, symbolId: huge.symbolId, score: 1 }]
        }
      ],
      symbols: [huge],
      topK: 5
    });

    expect(unit!.requirementText.length).toBe(DEFAULT_EXCERPT_BUDGET.requirementText + 1);
    expect(unit!.candidates[0]!.signature.length).toBe(DEFAULT_EXCERPT_BUDGET.signature + 1);
    expect(unit!.candidates[0]!.documentation.length).toBe(DEFAULT_EXCERPT_BUDGET.documentation + 1);
    expect(unit!.candidates[0]!.source.length).toBe(DEFAULT_EXCERPT_BUDGET.source + 1);
  });

  it("refuses to resolve a candidate that is not in the index", () => {
    expect(() =>
      buildTransmissionUnits({
        requirementTexts: new Map([["R-1", "text"]]),
        candidateSets: [
          {
            requirementId: "R-1",
            configurationId: "bm25f-v5",
            repositoryCommit: COMMIT,
            candidates: [{ rank: 1, symbolId: "src/gone.ts#ghost", score: 1 }]
          }
        ],
        symbols: [],
        topK: 5
      })
    ).toThrow(UnresolvedCandidateError);
  });

  it("returns structuredClone-safe data (CLAUDE.md rule 3)", () => {
    const { symbols, set } = run("R-1", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 3
    });
    expect(structuredClone(units)).toEqual(units);
  });
});

describe("auditTransmissionLog — AC1: exactly (requirements × ≤k) excerpts and nothing else", () => {
  it("passes a log built by the builder, with the excerpt count the run permitted", () => {
    const a = run("R-1", 20);
    const b = run("R-2", 3);
    const symbols = [...a.symbols, ...b.symbols];
    const candidateSets = [a.set, b.set];
    const units = buildTransmissionUnits({
      requirementTexts: new Map([
        ["R-1", "first"],
        ["R-2", "second"]
      ]),
      candidateSets,
      symbols,
      topK: 5
    });

    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets });
    expect(audit.violations).toEqual([]);
    expect(audit.bounded).toBe(true);
    expect(audit.requirementCount).toBe(2);
    // R-1 retrieved 20 and is capped at k=5; R-2 retrieved only 3.
    expect(audit.permittedExcerptCount).toBe(8);
    expect(audit.excerptCount).toBe(8);
  });

  it("flags a unit carrying more than k excerpts", () => {
    const { symbols, set } = run("R-1", 20);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 8
    });
    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [set] });
    expect(audit.bounded).toBe(false);
    expect(audit.violations.map((v) => v.rule)).toContain("excess-candidates");
  });

  it("flags a symbol that was transmitted but never retrieved for that requirement", () => {
    const a = run("R-1", 3);
    const b = run("R-2", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [a.set],
      symbols: a.symbols,
      topK: 5
    });
    // Smuggle in a symbol the retrieval step never surfaced for R-1.
    units[0]!.candidates.push({
      rank: 4,
      symbolId: "src/other.ts#secret",
      kind: "function",
      qualifiedName: "secret",
      relativePath: "src/other.ts",
      startLine: 1,
      endLine: 2,
      signature: "",
      documentation: "",
      source: "const apiKey = 'sk-live';"
    });

    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [a.set] });
    expect(audit.bounded).toBe(false);
    const violation = audit.violations.find((v) => v.rule === "unretrieved-candidate");
    expect(violation?.symbolId).toBe("src/other.ts#secret");
    expect(b.set.requirementId).toBe("R-2"); // guards the fixture, not the behavior
  });

  it("flags a requirement transmitted that was not part of the run", () => {
    const { symbols, set } = run("R-1", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 5
    });
    units.push({ requirementId: "R-99", requirementText: "not in this run", candidates: [] });

    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [set] });
    expect(audit.bounded).toBe(false);
    expect(audit.violations.map((v) => v.rule)).toContain("unknown-requirement");
  });

  it("flags a duplicated requirement", () => {
    const { symbols, set } = run("R-1", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 5
    });
    units.push(structuredClone(units[0]!));

    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [set] });
    expect(audit.violations.map((v) => v.rule)).toContain("duplicate-requirement");
  });

  it("flags an oversized field that bypassed the builder's budget", () => {
    const { symbols, set } = run("R-1", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 5
    });
    units[0]!.candidates[0]!.source = "x".repeat(DEFAULT_EXCERPT_BUDGET.source + 500);

    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [set] });
    expect(audit.bounded).toBe(false);
    expect(audit.violations.map((v) => v.rule)).toContain("oversized-field");
  });

  it("reports a missing requirement as incomplete but not as unbounded", () => {
    const a = run("R-1", 3);
    const b = run("R-2", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [a.set],
      symbols: a.symbols,
      topK: 5
    });

    const audit = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [a.set, b.set] });
    expect(audit.violations.map((v) => v.rule)).toEqual(["missing-requirement"]);
    expect(audit.bounded).toBe(true);
  });

  it("reports every violation in one pass rather than throwing on the first", () => {
    const { symbols, set } = run("R-1", 3);
    const units = buildTransmissionUnits({
      requirementTexts: new Map([["R-1", "text"]]),
      candidateSets: [set],
      symbols,
      topK: 5
    });
    units[0]!.candidates[0]!.source = "x".repeat(DEFAULT_EXCERPT_BUDGET.source + 500);
    units.push({ requirementId: "R-99", requirementText: "", candidates: [] });

    const rules = auditTransmissionLog({ log: logOf(units, 5), candidateSets: [set] }).violations.map(
      (v) => v.rule
    );
    expect(rules).toContain("oversized-field");
    expect(rules).toContain("unknown-requirement");
  });
});

describe("transmission log artifact", () => {
  it("serializes to stable, versioned JSON with no timestamp", () => {
    const { symbols, set } = run("R-1", 3);
    const log = logOf(
      buildTransmissionUnits({
        requirementTexts: new Map([["R-1", "text"]]),
        candidateSets: [set],
        symbols,
        topK: 5
      }),
      5
    );
    const text = serializeTransmissionLog(log);
    expect(serializeTransmissionLog(log)).toBe(text);
    const parsed = JSON.parse(text);
    expect(parsed.artifact).toBe(TRANSMISSION_LOG_ARTIFACT);
    expect(parsed.version).toBe(TRANSMISSION_LOG_VERSION);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
