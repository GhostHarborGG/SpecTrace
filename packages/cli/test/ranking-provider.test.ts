import { describe, expect, it } from "vitest";
import { rankCandidates, type TransmissionUnit } from "@spectrace/core";
import {
  RankingRequestError,
  createOpenAIRankingProvider,
  estimateTokens
} from "../src/ranking-provider.js";

function unit(requirementId: string, symbolIds: readonly string[]): TransmissionUnit {
  return {
    requirementId,
    requirementText: `${requirementId}: the system shall do the thing.`,
    candidates: symbolIds.map((symbolId, i) => ({
      rank: i + 1,
      symbolId,
      kind: "function",
      qualifiedName: symbolId,
      relativePath: "src/mod.ts",
      startLine: 1,
      endLine: 9,
      signature: `function ${symbolId}(): void`,
      documentation: "",
      source: `function ${symbolId}() {}`
    }))
  };
}

/** A fetch double returning scripted chat-completion payloads. */
function fetchReturning(
  responses: readonly { status?: number; body: unknown }[]
): { impl: typeof fetch; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  let index = 0;
  const impl = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const next = responses[Math.min(index++, responses.length - 1)]!;
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body)
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function completion(content: string, promptTokens = 1200, completionTokens = 90): unknown {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
  };
}

const VERDICTS = JSON.stringify({
  verdicts: [
    {
      symbolId: "alpha",
      classification: "implements",
      confidence: 0.88,
      rationale: "Implements the described behaviour."
    }
  ]
});

describe("OpenAI ranking adapter (REQ-CORE-030)", () => {
  it("sends the engine's prompt verbatim as system and user messages", async () => {
    const { impl, calls } = fetchReturning([{ body: completion(VERDICTS) }]);
    const provider = createOpenAIRankingProvider({ apiKey: "k", model: "test-model", fetchImpl: impl });

    await provider.complete({ system: "SYSTEM TEXT", user: "USER TEXT" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!["model"]).toBe("test-model");
    expect(calls[0]!["messages"]).toEqual([
      { role: "system", content: "SYSTEM TEXT" },
      { role: "user", content: "USER TEXT" }
    ]);
    // JSON mode removes the most common malformed-response cause rather than
    // merely recording it (REQ-CORE-031).
    expect(calls[0]!["response_format"]).toEqual({ type: "json_object" });
  });

  it("reports the provider's own token counts (REQ-CORE-032)", async () => {
    const { impl } = fetchReturning([{ body: completion(VERDICTS, 4321, 123) }]);
    const provider = createOpenAIRankingProvider({ apiKey: "k", model: "m", fetchImpl: impl });

    const response = await provider.complete({ system: "s", user: "u" });
    expect(response.inputTokens).toBe(4321);
    expect(response.outputTokens).toBe(123);
    expect(response.text).toBe(VERDICTS);
  });

  it("retries a 429 and succeeds", async () => {
    const { impl, calls } = fetchReturning([
      { status: 429, body: { error: "slow down" } },
      { body: completion(VERDICTS) }
    ]);
    const provider = createOpenAIRankingProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
      retryBaseMs: 1
    });

    const response = await provider.complete({ system: "s", user: "u" });
    expect(calls).toHaveLength(2);
    expect(response.text).toBe(VERDICTS);
  });

  it("does not retry a 400 — a malformed request will not improve", async () => {
    const { impl, calls } = fetchReturning([{ status: 400, body: { error: "bad model" } }]);
    const provider = createOpenAIRankingProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
      retryBaseMs: 1
    });

    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(RankingRequestError);
    expect(calls).toHaveLength(1);
  });

  it("gives up after maxAttempts on a persistent 500", async () => {
    const { impl, calls } = fetchReturning([{ status: 500, body: { error: "boom" } }]);
    const provider = createOpenAIRankingProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
      maxAttempts: 3,
      retryBaseMs: 1
    });

    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(/500/);
    expect(calls).toHaveLength(3);
  });

  it("returns an empty body with usage intact when the reply carries no content", async () => {
    // The call succeeded and was billed; core records it as malformed rather
    // than losing the cost (REQ-CORE-031, REQ-CORE-032).
    const { impl } = fetchReturning([
      { body: { choices: [{ message: {} }], usage: { prompt_tokens: 500, completion_tokens: 0 } } }
    ]);
    const provider = createOpenAIRankingProvider({ apiKey: "k", model: "m", fetchImpl: impl });

    const response = await provider.complete({ system: "s", user: "u" });
    expect(response.text).toBe("");
    expect(response.inputTokens).toBe(500);
  });

  it("drives a full ranking run through core without a network", async () => {
    const { impl } = fetchReturning([{ body: completion(VERDICTS) }]);
    const provider = createOpenAIRankingProvider({ apiKey: "k", model: "m", fetchImpl: impl });

    const result = await rankCandidates({
      units: [unit("REQ-X-001", ["alpha"])],
      provider,
      pricing: { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10 }
    });

    expect(result.failures).toEqual([]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.classification).toBe("implements");
    expect(result.usage.run.calls).toBe(1);
    expect(result.usage.run.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.modelId).toBe("m");
  });

  it("records a provider failure without crashing the run (REQ-CORE-031)", async () => {
    const { impl } = fetchReturning([{ status: 400, body: { error: "nope" } }]);
    const provider = createOpenAIRankingProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
      retryBaseMs: 1
    });

    const result = await rankCandidates({ units: [unit("REQ-X-001", ["alpha"])], provider });
    expect(result.proposals).toEqual([]);
    expect(result.failures[0]!.rule).toBe("provider-error");
  });
});

describe("token estimation", () => {
  it("scales with length and is only ever used for pre-call projections", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
