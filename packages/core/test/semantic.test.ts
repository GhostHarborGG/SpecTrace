import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  retrieveSemanticCandidates,
  semanticConfigurationId,
  symbolEmbeddingText,
  type EmbeddingProvider
} from "../src/retrieval/semantic.js";
import {
  EMBEDDING_CACHE_ARTIFACT,
  EMBEDDING_CACHE_VERSION,
  EmbeddingCache,
  EmbeddingCacheFormatError,
  embeddingKey,
  serializeEmbeddingCache
} from "../src/retrieval/embedding-cache.js";
import type { CodeSymbol } from "../src/indexer/types.js";

const COMMIT = "a".repeat(40);
const DIMENSIONS = 8;

/**
 * A deterministic stand-in for a real embedding model: hashes the text into a
 * fixed-dimension vector and counts every call and every text it was asked
 * to embed. The counters are what make REQ-CORE-021 AC1 checkable without a
 * network — the real provider is injected by the client, never built here.
 */
class CountingProvider implements EmbeddingProvider {
  readonly modelId = "test-embedding-v1";
  readonly dimensions = DIMENSIONS;
  callCount = 0;
  textCount = 0;

  async embed(texts: readonly string[]): Promise<number[][]> {
    this.callCount += 1;
    this.textCount += texts.length;
    return texts.map((text) => {
      const digest = createHash("sha256").update(text, "utf8").digest();
      return Array.from({ length: DIMENSIONS }, (_, i) => digest[i]! / 255);
    });
  }
}

function symbol(name: string, overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    symbolId: `src/mod.ts#${name}`,
    kind: "function",
    name,
    qualifiedName: name,
    relativePath: "src/mod.ts",
    startLine: 1,
    endLine: 5,
    signature: `function ${name}(): void`,
    documentation: `Does ${name}.`,
    normalizedSource: `function ${name}() {}`,
    exported: true,
    repositoryCommit: COMMIT,
    ...overrides
  };
}

const SYMBOLS = [symbol("alpha"), symbol("beta"), symbol("gamma")];
const QUERIES = [{ requirementId: "R-1", text: "the system shall alpha" }];

function run(provider: EmbeddingProvider, cache?: EmbeddingCache, topK = 2) {
  return retrieveSemanticCandidates({
    queries: QUERIES,
    symbols: SYMBOLS,
    topK,
    repositoryCommit: COMMIT,
    provider,
    ...(cache ? { cache } : {})
  });
}

describe("retrieveSemanticCandidates — AC1: a second run at the same commit makes zero embedding calls", () => {
  it("embeds on the first run and nothing on the second", async () => {
    const provider = new CountingProvider();
    const first = await run(provider);
    expect(provider.callCount).toBeGreaterThan(0);
    expect(first.embeddedCount).toBe(SYMBOLS.length + QUERIES.length);
    expect(first.cachedCount).toBe(0);

    const callsAfterFirst = provider.callCount;
    const second = await run(provider, first.cache);
    expect(provider.callCount).toBe(callsAfterFirst);
    expect(second.embeddedCount).toBe(0);
    expect(second.cachedCount).toBe(SYMBOLS.length + QUERIES.length);
    expect(second.results).toEqual(first.results);
  });

  it("survives the round trip through a serialized cache, which is how a second process gets it", async () => {
    const provider = new CountingProvider();
    const first = await run(provider);
    const onDisk = serializeEmbeddingCache(first.cache.toFile());

    const rehydrated = EmbeddingCache.parse(onDisk, provider.modelId, provider.dimensions);
    const second = await run(provider, rehydrated);
    expect(second.embeddedCount).toBe(0);
    expect(second.results).toEqual(first.results);
  });

  it("re-embeds only the symbol whose content changed", async () => {
    const provider = new CountingProvider();
    const first = await run(provider);
    const textCountAfterFirst = provider.textCount;

    // Same symbol ID — identity is declaration-based (REQ-CORE-010) — but the
    // body changed, which a symbol-keyed cache would miss.
    const edited = [
      { ...SYMBOLS[0]!, normalizedSource: "function alpha() { return 42; }" },
      SYMBOLS[1]!,
      SYMBOLS[2]!
    ];
    await retrieveSemanticCandidates({
      queries: QUERIES,
      symbols: edited,
      topK: 2,
      repositoryCommit: COMMIT,
      provider,
      cache: first.cache
    });

    expect(provider.textCount - textCountAfterFirst).toBe(1);
  });

  it("embeds identical text once no matter how many symbols carry it", async () => {
    const provider = new CountingProvider();
    const twin = { ...SYMBOLS[0]!, symbolId: "src/copy.ts#alpha" };
    await retrieveSemanticCandidates({
      queries: QUERIES,
      // Two symbols whose embedded text differs only by path, plus an exact twin.
      symbols: [SYMBOLS[0]!, { ...SYMBOLS[0]!, symbolId: "src/other.ts#alpha" }, twin],
      topK: 3,
      repositoryCommit: COMMIT,
      provider
    });
    // All three share the same embedded text (path comes from relativePath,
    // which is identical), so one symbol text plus one query text.
    expect(provider.textCount).toBe(2);
  });
});

describe("retrieveSemanticCandidates — ranking", () => {
  it("returns at most topK candidates, ranked from 1, with provenance", async () => {
    const { results } = await run(new CountingProvider(), undefined, 2);
    expect(results).toHaveLength(1);
    expect(results[0]!.requirementId).toBe("R-1");
    expect(results[0]!.configurationId).toBe(semanticConfigurationId("test-embedding-v1"));
    expect(results[0]!.repositoryCommit).toBe(COMMIT);
    expect(results[0]!.candidates).toHaveLength(2);
    expect(results[0]!.candidates.map((c) => c.rank)).toEqual([1, 2]);
  });

  it("ranks by descending similarity", async () => {
    const { results } = await run(new CountingProvider(), undefined, 3);
    const scores = results[0]!.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("breaks ties on symbol ID so equal scores never depend on iteration order", async () => {
    // A provider that gives every text the same vector makes every score equal.
    const flat: EmbeddingProvider = {
      modelId: "flat",
      dimensions: DIMENSIONS,
      embed: async (texts) => texts.map(() => Array.from({ length: DIMENSIONS }, () => 0.5))
    };
    const forward = await retrieveSemanticCandidates({
      queries: QUERIES,
      symbols: SYMBOLS,
      topK: 3,
      repositoryCommit: COMMIT,
      provider: flat
    });
    const reversed = await retrieveSemanticCandidates({
      queries: QUERIES,
      symbols: [...SYMBOLS].reverse(),
      topK: 3,
      repositoryCommit: COMMIT,
      provider: flat
    });
    expect(reversed.results[0]!.candidates).toEqual(forward.results[0]!.candidates);
  });

  it("returns structuredClone-safe results (CLAUDE.md rule 3)", async () => {
    const { results } = await run(new CountingProvider());
    expect(structuredClone(results)).toEqual(results);
  });

  it("scores a zero vector as 0 rather than NaN", async () => {
    const zero: EmbeddingProvider = {
      modelId: "zero",
      dimensions: DIMENSIONS,
      embed: async (texts) => texts.map(() => Array.from({ length: DIMENSIONS }, () => 0))
    };
    const { results } = await retrieveSemanticCandidates({
      queries: QUERIES,
      symbols: SYMBOLS,
      topK: 3,
      repositoryCommit: COMMIT,
      provider: zero
    });
    for (const candidate of results[0]!.candidates) expect(candidate.score).toBe(0);
  });

  it("rejects a provider that returns the wrong number of vectors", async () => {
    const short: EmbeddingProvider = {
      modelId: "short",
      dimensions: DIMENSIONS,
      embed: async () => []
    };
    await expect(
      retrieveSemanticCandidates({
        queries: QUERIES,
        symbols: SYMBOLS,
        topK: 2,
        repositoryCommit: COMMIT,
        provider: short
      })
    ).rejects.toThrow(/returned 0 vector/);
  });

  it("rejects a vector whose width contradicts the declared dimensions", async () => {
    const wide: EmbeddingProvider = {
      modelId: "wide",
      dimensions: DIMENSIONS,
      embed: async (texts) => texts.map(() => Array.from({ length: DIMENSIONS + 1 }, () => 0.1))
    };
    await expect(
      retrieveSemanticCandidates({
        queries: QUERIES,
        symbols: SYMBOLS,
        topK: 2,
        repositoryCommit: COMMIT,
        provider: wide
      })
    ).rejects.toThrow(/declares 8/);
  });

  it("batches requests and reports progress without writing to the console", async () => {
    const provider = new CountingProvider();
    const progress: [number, number][] = [];
    const many = Array.from({ length: 10 }, (_, i) => symbol(`sym${i}`));
    await retrieveSemanticCandidates({
      queries: QUERIES,
      symbols: many,
      topK: 3,
      repositoryCommit: COMMIT,
      provider,
      batchSize: 4,
      onProgress: (embedded, total) => progress.push([embedded, total])
    });
    // 10 symbols + 1 query = 11 texts, in batches of 4.
    expect(provider.callCount).toBe(3);
    expect(progress.at(-1)).toEqual([11, 11]);
  });

  it("defaults to a batch size that keeps a small run to one request", async () => {
    const provider = new CountingProvider();
    expect(SYMBOLS.length + QUERIES.length).toBeLessThan(DEFAULT_EMBEDDING_BATCH_SIZE);
    await run(provider);
    expect(provider.callCount).toBe(1);
  });
});

describe("symbolEmbeddingText", () => {
  it("draws on the same fields BM25F does, so A and B are compared on equal information", () => {
    const text = symbolEmbeddingText(SYMBOLS[0]!);
    expect(text).toContain("alpha");
    expect(text).toContain("src/mod.ts");
    expect(text).toContain("function alpha(): void");
    expect(text).toContain("Does alpha.");
    expect(text).toContain("function alpha() {}");
  });

  it("omits empty fields rather than emitting bare labels", () => {
    const bare = symbolEmbeddingText(symbol("x", { signature: "", documentation: "", normalizedSource: "" }));
    expect(bare).not.toContain("signature:");
    expect(bare).not.toContain("documentation:");
    expect(bare).not.toContain("source:");
  });

  it("is stable for a fixed symbol", () => {
    expect(symbolEmbeddingText(SYMBOLS[0]!)).toBe(symbolEmbeddingText(SYMBOLS[0]!));
  });
});

describe("EmbeddingCache", () => {
  it("serializes deterministically, sorted by key, with no timestamp", async () => {
    const first = await run(new CountingProvider());
    const text = serializeEmbeddingCache(first.cache.toFile());
    expect(serializeEmbeddingCache(first.cache.toFile())).toBe(text);

    const parsed = JSON.parse(text);
    expect(parsed.artifact).toBe(EMBEDDING_CACHE_ARTIFACT);
    expect(parsed.version).toBe(EMBEDDING_CACHE_VERSION);
    const keys = parsed.entries.map((e: { key: string }) => e.key);
    expect(keys).toEqual([...keys].sort());
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("discards a cache written by a different model rather than mixing vectors", async () => {
    const first = await run(new CountingProvider());
    const onDisk = serializeEmbeddingCache(first.cache.toFile());
    expect(EmbeddingCache.parse(onDisk, "some-other-model", DIMENSIONS).size).toBe(0);
  });

  it("discards a cache whose dimensions no longer match", async () => {
    const first = await run(new CountingProvider());
    const onDisk = serializeEmbeddingCache(first.cache.toFile());
    expect(EmbeddingCache.parse(onDisk, "test-embedding-v1", DIMENSIONS + 1).size).toBe(0);
  });

  it("drops entries this run never touched, so the cache cannot grow without bound", async () => {
    const provider = new CountingProvider();
    const first = await run(provider);
    const sizeAfterFirst = first.cache.size;

    // A run over one symbol touches far fewer keys than the first run wrote.
    const narrow = await retrieveSemanticCandidates({
      queries: QUERIES,
      symbols: [SYMBOLS[0]!],
      topK: 1,
      repositoryCommit: COMMIT,
      provider,
      cache: first.cache
    });
    expect(narrow.cache.toFile().entries).toHaveLength(2);
    expect(narrow.cache.toFile({ prune: false }).entries).toHaveLength(sizeAfterFirst);
  });

  it("ignores malformed entries rather than failing the run", () => {
    const cache = EmbeddingCache.fromFile(
      {
        artifact: EMBEDDING_CACHE_ARTIFACT,
        version: EMBEDDING_CACHE_VERSION,
        modelId: "m",
        dimensions: 2,
        entries: [
          { key: "good", vector: [1, 0] },
          { key: "wrong-width", vector: [1, 0, 0] },
          { key: "not-numbers", vector: ["a", "b"] },
          { key: "not-finite", vector: [Number.NaN, 1] }
        ]
      },
      "m",
      2
    );
    expect(cache.size).toBe(1);
    expect(cache.has("good")).toBe(true);
  });

  it("treats an unreadable cache file as absent, but says so on invalid JSON", () => {
    expect(() => EmbeddingCache.parse("{oops", "m", 2)).toThrow(EmbeddingCacheFormatError);
    expect(EmbeddingCache.fromFile(null, "m", 2).size).toBe(0);
    expect(EmbeddingCache.fromFile({ artifact: "something.else" }, "m", 2).size).toBe(0);
    expect(
      EmbeddingCache.fromFile({ artifact: EMBEDDING_CACHE_ARTIFACT, version: 99 }, "m", 2).size
    ).toBe(0);
  });

  it("keys on text, so the same text under any symbol resolves to one entry", () => {
    expect(embeddingKey("same")).toBe(embeddingKey("same"));
    expect(embeddingKey("same")).not.toBe(embeddingKey("different"));
  });
});
