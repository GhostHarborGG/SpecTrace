import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingRequestError,
  createOpenAIEmbeddingProvider
} from "../src/embedding-provider.js";

/** A fetch stand-in that returns a scripted sequence of responses and records every request body. */
function scriptedFetch(responses: (Response | Error)[]) {
  const bodies: Record<string, unknown>[] = [];
  const impl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const next = responses.shift();
    if (next === undefined) throw new Error("scriptedFetch ran out of responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return { impl: impl as unknown as typeof fetch, bodies, calls: impl };
}

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });

const vector = (fill: number, width = 1536) => Array.from({ length: width }, () => fill);

describe("createOpenAIEmbeddingProvider — configuration", () => {
  it("defaults to text-embedding-3-small and its native width", () => {
    const provider = createOpenAIEmbeddingProvider({ apiKey: "k" });
    expect(provider.modelId).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(provider.dimensions).toBe(1536);
  });

  it("records the shortened width in the model ID, so vectors of different widths never share a cache", () => {
    const provider = createOpenAIEmbeddingProvider({ apiKey: "k", dimensions: 256 });
    expect(provider.modelId).toBe(`${DEFAULT_EMBEDDING_MODEL}@256`);
    expect(provider.dimensions).toBe(256);
  });

  it("refuses to widen a model beyond its native output", () => {
    expect(() => createOpenAIEmbeddingProvider({ apiKey: "k", dimensions: 4096 })).toThrow(
      /would widen, not shorten/
    );
  });

  it("requires an explicit width for a model it does not know", () => {
    expect(() => createOpenAIEmbeddingProvider({ apiKey: "k", model: "some-future-model" })).toThrow(
      /pass --embedding-dimensions/
    );
    expect(() =>
      createOpenAIEmbeddingProvider({ apiKey: "k", model: "some-future-model", dimensions: 512 })
    ).not.toThrow();
  });
});

describe("createOpenAIEmbeddingProvider — requests", () => {
  it("sends one request per batch, carrying the key and the inputs", async () => {
    const fetchImpl = scriptedFetch([
      ok({ data: [{ index: 0, embedding: vector(0.1) }, { index: 1, embedding: vector(0.2) }] })
    ]);
    const provider = createOpenAIEmbeddingProvider({ apiKey: "sk-test", fetchImpl: fetchImpl.impl });

    const vectors = await provider.embed(["a", "b"]);
    expect(vectors).toHaveLength(2);
    expect(fetchImpl.bodies[0]).toMatchObject({ model: DEFAULT_EMBEDDING_MODEL, input: ["a", "b"] });
    // Omitted unless narrowed, so the native width is used.
    expect(fetchImpl.bodies[0]).not.toHaveProperty("dimensions");
  });

  it("sends dimensions only when the caller narrowed them", async () => {
    const fetchImpl = scriptedFetch([ok({ data: [{ index: 0, embedding: vector(0.1, 256) }] })]);
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "k",
      dimensions: 256,
      fetchImpl: fetchImpl.impl
    });
    await provider.embed(["a"]);
    expect(fetchImpl.bodies[0]).toMatchObject({ dimensions: 256 });
  });

  it("makes no request at all for an empty batch", async () => {
    const fetchImpl = scriptedFetch([]);
    const provider = createOpenAIEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl.impl });
    expect(await provider.embed([])).toEqual([]);
    expect(fetchImpl.calls).not.toHaveBeenCalled();
  });

  it("orders vectors by the response index rather than trusting array order", async () => {
    // Core matches vectors to inputs by position; a reordered response would
    // otherwise silently mislabel every embedding in the batch.
    const fetchImpl = scriptedFetch([
      ok({
        data: [
          { index: 2, embedding: vector(0.3) },
          { index: 0, embedding: vector(0.1) },
          { index: 1, embedding: vector(0.2) }
        ]
      })
    ]);
    const provider = createOpenAIEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl.impl });
    const vectors = await provider.embed(["a", "b", "c"]);
    expect(vectors.map((v) => v[0])).toEqual([0.1, 0.2, 0.3]);
  });

  it("rejects a response with the wrong number of vectors", async () => {
    const fetchImpl = scriptedFetch([ok({ data: [{ index: 0, embedding: vector(0.1) }] })]);
    const provider = createOpenAIEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl.impl });
    await expect(provider.embed(["a", "b"])).rejects.toThrow(/1 vector\(s\) for 2 input\(s\)/);
  });
});

describe("createOpenAIEmbeddingProvider — failures", () => {
  it("retries a 429 and succeeds", async () => {
    const fetchImpl = scriptedFetch([
      new Response("rate limited", { status: 429 }),
      ok({ data: [{ index: 0, embedding: vector(0.1) }] })
    ]);
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: fetchImpl.impl,
      retryBaseMs: 1
    });
    expect(await provider.embed(["a"])).toHaveLength(1);
    expect(fetchImpl.calls).toHaveBeenCalledTimes(2);
  });

  it("retries a transport failure", async () => {
    const fetchImpl = scriptedFetch([
      new Error("socket hang up"),
      ok({ data: [{ index: 0, embedding: vector(0.1) }] })
    ]);
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: fetchImpl.impl,
      retryBaseMs: 1
    });
    expect(await provider.embed(["a"])).toHaveLength(1);
  });

  it("does not retry a 401 — a bad key will not improve with time", async () => {
    const fetchImpl = scriptedFetch([new Response("bad key", { status: 401 })]);
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: fetchImpl.impl,
      retryBaseMs: 1
    });
    await expect(provider.embed(["a"])).rejects.toThrow(EmbeddingRequestError);
    expect(fetchImpl.calls).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and reports the last status", async () => {
    const fetchImpl = scriptedFetch([
      new Response("boom", { status: 503 }),
      new Response("boom", { status: 503 })
    ]);
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: fetchImpl.impl,
      maxAttempts: 2,
      retryBaseMs: 1
    });
    await expect(provider.embed(["a"])).rejects.toThrow(/503/);
    expect(fetchImpl.calls).toHaveBeenCalledTimes(2);
  });
});
