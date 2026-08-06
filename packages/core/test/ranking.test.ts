import { describe, expect, it } from "vitest";
import {
  RANKING_PROMPT_VERSION,
  RANKING_SYSTEM_PROMPT,
  RECORDED_PROMPT_DIGEST,
  buildRankingPrompt,
  rankingPromptDigest
} from "../src/ranking/prompt.js";
import { parseRankingResponse, rankCandidates } from "../src/ranking/rank.js";
import { estimateCostUsd, summarizeUsage } from "../src/ranking/usage.js";
import { TRACE_CLASSIFICATIONS } from "../src/ranking/types.js";
import type {
  ModelPricing,
  RankingProvider,
  RankingRequest,
  RankingResponse,
  UsageRecord
} from "../src/ranking/types.js";
import type { TransmissionUnit } from "../src/transmission/bounded-payload.js";

function unit(requirementId: string, symbolIds: readonly string[]): TransmissionUnit {
  return {
    requirementId,
    requirementText: `${requirementId}: the system shall do the thing.`,
    candidates: symbolIds.map((symbolId, i) => ({
      rank: i + 1,
      symbolId,
      kind: "function",
      qualifiedName: symbolId.split("#")[1] ?? symbolId,
      relativePath: "src/mod.ts",
      startLine: i * 10 + 1,
      endLine: i * 10 + 8,
      signature: `function ${symbolId}(): void`,
      documentation: `Docs for ${symbolId}.`,
      source: `function ${symbolId}() {}`
    }))
  };
}

function verdict(symbolId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbolId,
    classification: "implements",
    confidence: 0.9,
    rationale: `${symbolId} does what the requirement describes.`,
    ...overrides
  };
}

function body(verdicts: unknown[]): string {
  return JSON.stringify({ verdicts });
}

/** A provider that replays scripted bodies, one per call, and counts its calls. */
function scriptedProvider(
  bodies: readonly (string | Error)[],
  options: { modelId?: string; inputTokens?: number; outputTokens?: number } = {}
): RankingProvider & { calls: RankingRequest[] } {
  const calls: RankingRequest[] = [];
  let index = 0;
  return {
    modelId: options.modelId ?? "test-model",
    calls,
    async complete(request: RankingRequest): Promise<RankingResponse> {
      calls.push(request);
      const next = bodies[index++];
      if (next instanceof Error) throw next;
      return {
        text: next ?? body([]),
        inputTokens: options.inputTokens ?? 100,
        outputTokens: options.outputTokens ?? 20
      };
    }
  };
}

const PRICING: ModelPricing = { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10 };

describe("REQ-CORE-030 proposal generation", () => {
  it("AC1: every stored proposal has classification, confidence, and rationale populated", async () => {
    const provider = scriptedProvider([
      body([
        verdict("ts:src/mod.ts#alpha:function"),
        verdict("ts:src/mod.ts#beta:function", {
          classification: "supports",
          confidence: 0.4,
          rationale: "Called by the implementation."
        })
      ])
    ]);

    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["ts:src/mod.ts#alpha:function", "ts:src/mod.ts#beta:function"])],
      provider
    });

    expect(result.failures).toEqual([]);
    expect(result.proposals).toHaveLength(2);
    for (const proposal of result.proposals) {
      expect(TRACE_CLASSIFICATIONS).toContain(proposal.classification);
      expect(proposal.confidence).toBeGreaterThanOrEqual(0);
      expect(proposal.confidence).toBeLessThanOrEqual(1);
      expect(proposal.rationale.trim().length).toBeGreaterThan(0);
    }
    expect(result.proposals.map((p) => p.classification)).toEqual(["implements", "supports"]);
    expect(result.proposals.map((p) => p.rank)).toEqual([1, 2]);
  });

  it("AC2: the recorded prompt digest matches the live template", () => {
    // Guard. If this fails you edited the prompt: bump RANKING_PROMPT_VERSION
    // and update RECORDED_PROMPT_DIGEST to the value below, together.
    expect(rankingPromptDigest()).toBe(RECORDED_PROMPT_DIGEST);
  });

  it("AC2: the prompt version reaches every proposal's provenance and every failure record", async () => {
    const provider = scriptedProvider([body([verdict("ts:src/mod.ts#alpha:function")]), "not json"]);

    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]), unit("REQ-X-002", ["ts:src/mod.ts#beta:function"])],
      provider
    });

    expect(result.promptVersion).toBe(RANKING_PROMPT_VERSION);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.promptVersion).toBe(RANKING_PROMPT_VERSION);
    expect(result.failures[0]!.modelId).toBe("test-model");
  });

  it("classifications are spelled as ground truth spells relationships", () => {
    // A drift here would silently depress every precision figure the capstone
    // reports, since proposals and labels would never compare equal.
    expect(TRACE_CLASSIFICATIONS).toContain("implements");
    expect(TRACE_CLASSIFICATIONS).toContain("supports");
  });

  it("sends only the bounded payload, and nothing for a requirement with no candidates", async () => {
    const provider = scriptedProvider([body([verdict("ts:src/mod.ts#alpha:function")])]);
    const empty = unit("REQ-X-002", []);

    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]), empty],
      provider
    });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.user).toContain("ts:src/mod.ts#alpha:function");
    expect(provider.calls[0]!.user).not.toContain("REQ-X-002");
    expect(provider.calls[0]!.system).toBe(RANKING_SYSTEM_PROMPT);
    expect(result.usage.records).toHaveLength(1);
  });

  it("orders proposals by requirement then candidate rank, whatever order the model answered in", async () => {
    const provider = scriptedProvider([
      body([verdict("ts:src/mod.ts#beta:function"), verdict("ts:src/mod.ts#alpha:function")])
    ]);

    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["ts:src/mod.ts#alpha:function", "ts:src/mod.ts#beta:function"])],
      provider
    });

    expect(result.proposals.map((p) => p.rank)).toEqual([1, 2]);
  });

  it("returns structuredClone-safe results (CLAUDE.md rule 3)", async () => {
    const provider = scriptedProvider([body([verdict("ts:src/mod.ts#alpha:function")])]);
    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"])],
      provider,
      pricing: PRICING
    });
    expect(() => structuredClone(result)).not.toThrow();
    expect(structuredClone(result)).toEqual(result);
  });

  it("builds a prompt carrying the requirement and every candidate field", () => {
    const request = buildRankingPrompt(unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]));
    expect(request.user).toContain("REQ-X-001");
    expect(request.user).toContain("the system shall do the thing");
    expect(request.user).toContain("ts:src/mod.ts#alpha:function");
    expect(request.user).toContain("src/mod.ts:1-8");
    expect(request.user).toContain("Docs for ts:src/mod.ts#alpha:function.");
  });
});

describe("REQ-CORE-031 malformed-response handling", () => {
  it("AC1: an injected malformed response yields a failure record, a nonzero count, and a completed run", async () => {
    const provider = scriptedProvider([
      "I think the second one looks right, honestly.",
      body([verdict("ts:src/mod.ts#gamma:function")])
    ]);

    const result = await rankCandidates({
      units: [
        unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
        unit("REQ-X-002", ["ts:src/mod.ts#gamma:function"])
      ],
      provider
    });

    // A failure record, with provenance and a raw payload reference.
    expect(result.failures).toHaveLength(1);
    const failure = result.failures[0]!;
    expect(failure.rule).toBe("invalid-json");
    expect(failure.scope).toBe("response");
    expect(failure.requirementId).toBe("REQ-X-001");
    expect(failure.rawResponseRef).toMatch(/^[0-9a-f]{12}$/);

    // The reference resolves to the payload the model actually sent.
    const raw = result.rawResponses.find((r) => r.ref === failure.rawResponseRef);
    expect(raw?.body).toBe("I think the second one looks right, honestly.");

    // Excluded from proposals; the run completed and the next requirement ranked.
    expect(result.proposals.map((p) => p.requirementId)).toEqual(["REQ-X-002"]);
  });

  it("never throws when the provider itself fails, and records the call as a failure", async () => {
    const provider = scriptedProvider([
      new Error("429 rate limited"),
      body([verdict("ts:src/mod.ts#gamma:function")])
    ]);

    const result = await rankCandidates({
      units: [
        unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
        unit("REQ-X-002", ["ts:src/mod.ts#gamma:function"])
      ],
      provider
    });

    expect(result.failures[0]!.rule).toBe("provider-error");
    expect(result.failures[0]!.message).toContain("429 rate limited");
    expect(result.proposals).toHaveLength(1);
    // A call that never returned was never billed.
    expect(result.usage.records).toHaveLength(1);
  });

  it("attributes one bad entry to that candidate and keeps the rest of the response", () => {
    const target = unit("REQ-X-001", [
      "ts:src/mod.ts#alpha:function",
      "ts:src/mod.ts#beta:function",
      "ts:src/mod.ts#gamma:function"
    ]);
    const text = body([
      verdict("ts:src/mod.ts#alpha:function"),
      verdict("ts:src/mod.ts#beta:function", { confidence: 4 }),
      verdict("ts:src/mod.ts#gamma:function")
    ]);

    const outcome = parseRankingResponse(text, {
      unit: target,
      rawResponseRef: "deadbeefcafe",
      modelId: "test-model"
    });

    expect(outcome.proposals.map((p) => p.symbolId)).toEqual([
      "ts:src/mod.ts#alpha:function",
      "ts:src/mod.ts#gamma:function"
    ]);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]!.rule).toBe("confidence-out-of-range");
    expect(outcome.failures[0]!.scope).toBe("entry");
    expect(outcome.failures[0]!.symbolId).toBe("ts:src/mod.ts#beta:function");
  });

  it.each([
    ["a hallucinated symbol", [verdict("ts:src/other.ts#ghost:function")], "unknown-symbol"],
    [
      "an unknown classification",
      [verdict("ts:src/mod.ts#alpha:function", { classification: "maybe" })],
      "unknown-classification"
    ],
    [
      "a NaN confidence",
      [verdict("ts:src/mod.ts#alpha:function", { confidence: Number.NaN })],
      "confidence-out-of-range"
    ],
    [
      "a blank rationale",
      [verdict("ts:src/mod.ts#alpha:function", { rationale: "   " })],
      "empty-rationale"
    ],
    [
      "a duplicate verdict",
      [verdict("ts:src/mod.ts#alpha:function"), verdict("ts:src/mod.ts#alpha:function")],
      "duplicate-symbol"
    ],
    ["an entry that is not an object", [42], "schema-mismatch"]
  ])("classifies %s as %s", (_label, verdicts, rule) => {
    const outcome = parseRankingResponse(body(verdicts as unknown[]), {
      unit: unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
      rawResponseRef: "deadbeefcafe",
      modelId: "test-model"
    });
    expect(outcome.failures.map((f) => f.rule)).toContain(rule);
  });

  it("reports a candidate the model never ruled on", () => {
    const outcome = parseRankingResponse(body([verdict("ts:src/mod.ts#alpha:function")]), {
      unit: unit("REQ-X-001", ["ts:src/mod.ts#alpha:function", "ts:src/mod.ts#beta:function"]),
      rawResponseRef: "deadbeefcafe",
      modelId: "test-model"
    });

    expect(outcome.proposals).toHaveLength(1);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]!.rule).toBe("missing-verdict");
    expect(outcome.failures[0]!.symbolId).toBe("ts:src/mod.ts#beta:function");
  });

  it("treats a response with no verdicts array as a whole-response fault", () => {
    const outcome = parseRankingResponse(JSON.stringify({ results: [] }), {
      unit: unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
      rawResponseRef: "deadbeefcafe",
      modelId: "test-model"
    });
    expect(outcome.failures.map((f) => f.rule)).toEqual(["schema-mismatch"]);
    expect(outcome.failures[0]!.scope).toBe("response");
  });

  it("accepts a fenced body — a formatting habit is not a broken contract", () => {
    const fenced = "```json\n" + body([verdict("ts:src/mod.ts#alpha:function")]) + "\n```";
    const outcome = parseRankingResponse(fenced, {
      unit: unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
      rawResponseRef: "deadbeefcafe",
      modelId: "test-model"
    });
    expect(outcome.failures).toEqual([]);
    expect(outcome.proposals).toHaveLength(1);
  });

  it("keeps every requirement's failures attributed to it across a run", async () => {
    const provider = scriptedProvider(["nope", "also nope"]);
    const result = await rankCandidates({
      units: [
        unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
        unit("REQ-X-002", ["ts:src/mod.ts#beta:function"])
      ],
      provider
    });
    expect(result.failures.map((f) => f.requirementId)).toEqual(["REQ-X-001", "REQ-X-002"]);
    expect(result.proposals).toEqual([]);
  });
});

describe("REQ-CORE-032 usage accounting", () => {
  it("AC1: run totals equal the sum of the per-call records", async () => {
    const provider = scriptedProvider(
      [
        body([verdict("ts:src/mod.ts#alpha:function")]),
        body([verdict("ts:src/mod.ts#beta:function")]),
        body([verdict("ts:src/mod.ts#gamma:function")])
      ],
      { inputTokens: 1234, outputTokens: 321 }
    );

    const result = await rankCandidates({
      units: [
        unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
        unit("REQ-X-002", ["ts:src/mod.ts#beta:function"]),
        unit("REQ-X-003", ["ts:src/mod.ts#gamma:function"])
      ],
      provider,
      pricing: PRICING
    });

    const { records, run } = result.usage;
    expect(records).toHaveLength(3);
    expect(run.calls).toBe(records.length);
    expect(run.inputTokens).toBe(records.reduce((sum, r) => sum + r.inputTokens, 0));
    expect(run.outputTokens).toBe(records.reduce((sum, r) => sum + r.outputTokens, 0));
    expect(run.estimatedCostUsd).toBe(records.reduce((sum, r) => sum + r.estimatedCostUsd, 0));
    expect(run.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("reports per-requirement totals alongside the run total", async () => {
    const provider = scriptedProvider(
      [body([verdict("ts:src/mod.ts#alpha:function")]), body([verdict("ts:src/mod.ts#beta:function")])],
      { inputTokens: 1000, outputTokens: 100 }
    );

    const result = await rankCandidates({
      units: [
        unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
        unit("REQ-X-002", ["ts:src/mod.ts#beta:function"])
      ],
      provider,
      pricing: PRICING
    });

    expect(result.usage.byRequirement.map((entry) => entry.requirementId)).toEqual([
      "REQ-X-001",
      "REQ-X-002"
    ]);
    for (const entry of result.usage.byRequirement) {
      expect(entry.totals.calls).toBe(1);
      expect(entry.totals.inputTokens).toBe(1000);
      expect(entry.totals.estimatedCostUsd).toBe(estimateCostUsd(1000, 100, PRICING));
    }
  });

  it("folds embedding usage into the run total and into no requirement", () => {
    const records: UsageRecord[] = [
      {
        kind: "embedding",
        modelId: "text-embedding-3-small",
        inputTokens: 50_000,
        outputTokens: 0,
        estimatedCostUsd: 0.001
      },
      {
        kind: "ranking",
        modelId: "test-model",
        requirementId: "REQ-X-001",
        inputTokens: 1000,
        outputTokens: 100,
        estimatedCostUsd: 0.0035
      }
    ];

    const report = summarizeUsage(records);
    expect(report.run.calls).toBe(2);
    expect(report.run.inputTokens).toBe(51_000);
    expect(report.byRequirement).toHaveLength(1);
    expect(report.byRequirement[0]!.totals.inputTokens).toBe(1000);
  });

  it("carries prior-stage usage through a ranking run", async () => {
    const provider = scriptedProvider([body([verdict("ts:src/mod.ts#alpha:function")])]);
    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"])],
      provider,
      pricing: PRICING,
      priorUsage: [
        {
          kind: "embedding",
          modelId: "text-embedding-3-small",
          inputTokens: 900,
          outputTokens: 0,
          estimatedCostUsd: 0.00002
        }
      ]
    });

    expect(result.usage.records.map((r) => r.kind)).toEqual(["embedding", "ranking"]);
    expect(result.usage.run.calls).toBe(2);
  });

  it("estimates zero cost, not a guessed cost, when no rates were supplied", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBe(0);
    expect(estimateCostUsd(1_000_000, 0, PRICING)).toBe(2.5);
    expect(estimateCostUsd(0, 1_000_000, PRICING)).toBe(10);
  });

  it("reports progress through injected callbacks rather than output (CLAUDE.md rule 2)", async () => {
    const provider = scriptedProvider([
      body([verdict("ts:src/mod.ts#alpha:function")]),
      body([verdict("ts:src/mod.ts#beta:function")])
    ]);
    const seen: Array<[number, number]> = [];

    await rankCandidates({
      units: [
        unit("REQ-X-001", ["ts:src/mod.ts#alpha:function"]),
        unit("REQ-X-002", ["ts:src/mod.ts#beta:function"])
      ],
      provider,
      onProgress: (completed, total) => seen.push([completed, total])
    });

    expect(seen).toEqual([
      [1, 2],
      [2, 2]
    ]);
  });
});
