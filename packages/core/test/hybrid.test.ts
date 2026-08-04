import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALPHA,
  DEFAULT_MERGE_STRATEGY,
  DEFAULT_RRF_K,
  MERGE_STRATEGY_IDS,
  hybridConfigurationId,
  mergeCandidateSets,
  mergePoolSize,
  type MergeStrategyId
} from "../src/retrieval/hybrid.js";
import type { CandidateSet } from "../src/retrieval/retrieve.js";

const COMMIT = "a".repeat(40);

function set(
  requirementId: string,
  configurationId: string,
  ranked: [string, number][]
): CandidateSet {
  return {
    requirementId,
    configurationId,
    repositoryCommit: COMMIT,
    candidates: ranked.map(([symbolId, score], i) => ({ rank: i + 1, symbolId, score }))
  };
}

// Lexical scores are unbounded BM25; semantic scores are cosine in [-1, 1].
// The scale mismatch is the whole reason rank-based fusion exists.
const LEXICAL = [set("R-1", "bm25f-v5", [["a", 42.7], ["b", 31.2], ["c", 8.1]])];
const SEMANTIC = [set("R-1", "embed-v1:m", [["c", 0.91], ["d", 0.88], ["a", 0.62]])];

describe("mergeCandidateSets — both strategies (REQ-CORE-022)", () => {
  it.each(MERGE_STRATEGY_IDS)("%s produces a ranked list from both inputs", (strategy) => {
    const [merged] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy }
    });
    expect(merged!.requirementId).toBe("R-1");
    expect(merged!.repositoryCommit).toBe(COMMIT);
    expect(merged!.candidates.map((c) => c.rank)).toEqual([1, 2, 3, 4]);
    // Union of both lists: a, b, c from lexical; c, d, a from semantic.
    expect(merged!.candidates.map((c) => c.symbolId).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it.each(MERGE_STRATEGY_IDS)("%s ranks by descending merged score", (strategy) => {
    const [merged] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy }
    });
    const scores = merged!.candidates.map((c) => c.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it.each(MERGE_STRATEGY_IDS)("%s truncates to topK after merging, not before", (strategy) => {
    const [merged] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 2,
      config: { strategy }
    });
    expect(merged!.candidates).toHaveLength(2);
  });

  it.each(MERGE_STRATEGY_IDS)("%s promotes a symbol both lists agree on", (strategy) => {
    // `a` is lexical rank 1 and semantic rank 3; `b` appears in one list only.
    const [merged] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy }
    });
    const order = merged!.candidates.map((c) => c.symbolId);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
  });

  it.each(MERGE_STRATEGY_IDS)("%s breaks ties on symbol ID, never on input order", (strategy) => {
    const flatLexical = [set("R-1", "bm25f-v5", [["z", 1], ["y", 1]])];
    const flatSemantic = [set("R-1", "embed-v1:m", [["y", 1], ["z", 1]])];
    const forward = mergeCandidateSets({
      lexical: flatLexical,
      semantic: flatSemantic,
      topK: 2,
      config: { strategy }
    });
    const swapped = mergeCandidateSets({
      lexical: [set("R-1", "bm25f-v5", [["y", 1], ["z", 1]])],
      semantic: [set("R-1", "embed-v1:m", [["z", 1], ["y", 1]])],
      topK: 2,
      config: { strategy }
    });
    expect(forward[0]!.candidates.map((c) => c.symbolId)).toEqual(
      swapped[0]!.candidates.map((c) => c.symbolId)
    );
  });

  it.each(MERGE_STRATEGY_IDS)("%s returns structuredClone-safe results", (strategy) => {
    const merged = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy }
    });
    expect(structuredClone(merged)).toEqual(merged);
  });
});

describe("rrf-v1 — rank fusion needs no score calibration", () => {
  it("is unaffected by rescaling one configuration's scores", () => {
    // Multiplying every lexical score by 1000 changes no rank, so a
    // rank-based merge must produce exactly the same output. This is the
    // property a weighted sum over raw scores would not have.
    const inflated = [set("R-1", "bm25f-v5", [["a", 42700], ["b", 31200], ["c", 8100]])];
    const base = mergeCandidateSets({ lexical: LEXICAL, semantic: SEMANTIC, topK: 4, config: { strategy: "rrf-v1" } });
    const scaled = mergeCandidateSets({ lexical: inflated, semantic: SEMANTIC, topK: 4, config: { strategy: "rrf-v1" } });
    expect(scaled).toEqual(base);
  });

  it("scores a rank-1-in-both symbol above anything ranked once", () => {
    const both = mergeCandidateSets({
      lexical: [set("R-1", "l", [["top", 10], ["other", 9]])],
      semantic: [set("R-1", "s", [["top", 0.9], ["another", 0.8]])],
      topK: 3,
      config: { strategy: "rrf-v1" }
    });
    expect(both[0]!.candidates[0]!.symbolId).toBe("top");
    expect(both[0]!.candidates[0]!.score).toBeCloseTo(2 / (DEFAULT_RRF_K + 1), 10);
  });

  it("honors a custom rrfK: a small k sharpens the rank-1/rank-2 gap, a large k flattens it", () => {
    // Both lists agree on the order, so ranks 1 and 2 are unambiguous — the
    // shared fixture above is symmetric between `a` and `c` and would tie at
    // every k, measuring nothing.
    const agreeing = {
      lexical: [set("R-1", "l", [["first", 10], ["second", 9], ["third", 8]])],
      semantic: [set("R-1", "s", [["first", 0.9], ["second", 0.8], ["third", 0.7]])],
      topK: 3
    };
    const spread = (rrfK: number) => {
      const [merged] = mergeCandidateSets({ ...agreeing, config: { strategy: "rrf-v1", rrfK } });
      return merged!.candidates[0]!.score - merged!.candidates[1]!.score;
    };
    expect(spread(1)).toBeGreaterThan(spread(1000));
  });
});

describe("weighted-v1 — normalized blend", () => {
  it("puts a list's own best at 1 and its own worst at 0 before blending", () => {
    // Lexical-only weighting reproduces the lexical order exactly.
    const [lexicalOnly] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy: "weighted-v1", alpha: 1 }
    });
    expect(lexicalOnly!.candidates[0]!.symbolId).toBe("a");
    expect(lexicalOnly!.candidates[0]!.score).toBeCloseTo(1, 10);

    const [semanticOnly] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy: "weighted-v1", alpha: 0 }
    });
    expect(semanticOnly!.candidates[0]!.symbolId).toBe("c");
  });

  it("treats absence from a list as no contribution, not as a zero score", () => {
    // `d` appears only in the semantic list. With alpha 0 it must score
    // exactly its normalized semantic value, unpenalized by its absence.
    const [merged] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy: "weighted-v1", alpha: 0 }
    });
    const d = merged!.candidates.find((c) => c.symbolId === "d")!;
    // semantic scores 0.91 / 0.88 / 0.62 → d normalizes to (0.88-0.62)/(0.91-0.62).
    expect(d.score).toBeCloseTo((0.88 - 0.62) / (0.91 - 0.62), 10);
  });

  it("normalizes an all-equal list to 1 rather than deleting its opinion", () => {
    const [merged] = mergeCandidateSets({
      lexical: [set("R-1", "l", [["a", 5], ["b", 5]])],
      semantic: [],
      topK: 2,
      config: { strategy: "weighted-v1", alpha: 1 }
    });
    expect(merged!.candidates.map((c) => c.score)).toEqual([1, 1]);
  });

  it("defaults alpha to an even split", () => {
    const [explicit] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy: "weighted-v1", alpha: DEFAULT_ALPHA }
    });
    const [implicit] = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 4,
      config: { strategy: "weighted-v1" }
    });
    expect(implicit).toEqual(explicit);
  });
});

describe("mergeCandidateSets — degenerate inputs", () => {
  it("passes through when one configuration returned nothing at all", () => {
    const [merged] = mergeCandidateSets({ lexical: LEXICAL, semantic: [], topK: 3 });
    expect(merged!.candidates.map((c) => c.symbolId)).toEqual(["a", "b", "c"]);
  });

  it("keeps a requirement only the semantic run produced", () => {
    const merged = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: [...SEMANTIC, set("R-2", "embed-v1:m", [["x", 0.5]])],
      topK: 3
    });
    expect(merged.map((s) => s.requirementId)).toEqual(["R-1", "R-2"]);
    expect(merged[1]!.candidates.map((c) => c.symbolId)).toEqual(["x"]);
  });

  it("produces an empty list when neither configuration retrieved anything", () => {
    const merged = mergeCandidateSets({
      lexical: [set("R-1", "l", [])],
      semantic: [set("R-1", "s", [])],
      topK: 5
    });
    expect(merged[0]!.candidates).toEqual([]);
  });
});

describe("merge configuration identity", () => {
  it("names the strategy, its parameter, and both input configurations", () => {
    expect(hybridConfigurationId("bm25f-v5", "embed-v1:m", { strategy: "rrf-v1" })).toBe(
      `hybrid(rrf-v1;k=${DEFAULT_RRF_K})[bm25f-v5+embed-v1:m]`
    );
    expect(
      hybridConfigurationId("bm25f-v5", "embed-v1:m", { strategy: "weighted-v1", alpha: 0.3 })
    ).toBe("hybrid(weighted-v1;a=0.3)[bm25f-v5+embed-v1:m]");
  });

  it("is carried on every merged set, so a run is attributable (REQ-CORE-063)", () => {
    const [merged] = mergeCandidateSets({ lexical: LEXICAL, semantic: SEMANTIC, topK: 3 });
    expect(merged!.configurationId).toBe(
      hybridConfigurationId("bm25f-v5", "embed-v1:m", { strategy: DEFAULT_MERGE_STRATEGY })
    );
  });

  it("distinguishes two strategies that would otherwise look identical", () => {
    const rrf = mergeCandidateSets({ lexical: LEXICAL, semantic: SEMANTIC, topK: 3, config: { strategy: "rrf-v1" } });
    const weighted = mergeCandidateSets({
      lexical: LEXICAL,
      semantic: SEMANTIC,
      topK: 3,
      config: { strategy: "weighted-v1" }
    });
    expect(rrf[0]!.configurationId).not.toBe(weighted[0]!.configurationId);
  });
});

describe("mergePoolSize", () => {
  it("is wider than the output, so the merge has disagreement to work with", () => {
    expect(mergePoolSize(10)).toBeGreaterThan(10);
  });

  it("names every shipped strategy in the registry", () => {
    const ids: MergeStrategyId[] = ["rrf-v1", "weighted-v1"];
    expect([...MERGE_STRATEGY_IDS]).toEqual(ids);
    expect(MERGE_STRATEGY_IDS).toContain(DEFAULT_MERGE_STRATEGY);
  });
});
