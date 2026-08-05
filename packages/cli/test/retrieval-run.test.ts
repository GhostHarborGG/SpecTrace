import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EmbeddingCache,
  embeddingKey,
  serializeEmbeddingCache,
  symbolEmbeddingText,
  type CodeSymbol
} from "@spectrace/core";
import { runRetrieval } from "../src/retrieval-run.js";

const COMMIT = "a".repeat(40);
const DIMENSIONS = 4;

const symbol = (name: string): CodeSymbol => ({
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
  repositoryCommit: COMMIT
});

const SYMBOLS = [symbol("alpha"), symbol("beta")];
const QUERIES = [{ requirementId: "R-1", text: "the system shall alpha" }];

/** A cache covering exactly the texts this corpus needs, as a completed run would leave behind. */
function writeFullCache(file: string, modelId = "test-model", dimensions = DIMENSIONS): void {
  const cache = new EmbeddingCache(modelId, dimensions);
  const texts = [...SYMBOLS.map(symbolEmbeddingText), ...QUERIES.map((q) => q.text)];
  texts.forEach((text, i) => {
    const vector = Array.from({ length: dimensions }, (_, d) => (d === i % dimensions ? 1 : 0));
    cache.set(embeddingKey(text), vector);
  });
  writeFileSync(file, serializeEmbeddingCache(cache.toFile({ prune: false })), "utf8");
}

describe("runRetrieval — a fully cached run needs no API key (REQ-CORE-021 AC1)", () => {
  let dir: string;
  let cacheFile: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "spectrace-cacheonly-"));
    cacheFile = path.join(dir, "embeddings.json");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("serves semantic retrieval from cache with no key at all", async () => {
    writeFullCache(cacheFile);
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: { cachePath: cacheFile }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0]!.candidates).toHaveLength(2);
    // Zero embeddings performed is proved by the run succeeding at all: the
    // cache-only provider rejects any miss rather than falling back.
    expect(result.embeddings?.embedded).toBe(0);
    expect(result.configurationId).toContain("test-model");
  });

  it("reports what it embedded in enough detail to disclose it (REQ-CORE-023 AC2)", async () => {
    writeFullCache(cacheFile);
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: { cachePath: cacheFile }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Named even on a fully cached run: these vectors came from that model on
    // whichever earlier run paid for them, and a disclosure that omitted it
    // would leave a reader unable to say where the corpus went.
    expect(result.embeddings).toEqual({
      modelId: "test-model",
      dimensions: DIMENSIONS,
      symbolTexts: SYMBOLS.length,
      queryTexts: QUERIES.length,
      embedded: 0,
      cached: SYMBOLS.length + QUERIES.length,
      cachePath: cacheFile
    });
  });

  it("counts the whole corpus in hybrid mode too, not the merged top-k", async () => {
    writeFullCache(cacheFile);
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "hybrid",
      topK: 1,
      embedding: { cachePath: cacheFile }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.embeddings?.symbolTexts).toBe(SYMBOLS.length);
  });

  it("serves hybrid from the same cache, so comparing merge strategies costs nothing", async () => {
    writeFullCache(cacheFile);
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "hybrid",
      topK: 2,
      merge: { strategy: "weighted-v1" },
      embedding: { cachePath: cacheFile }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.configurationId).toContain("weighted-v1");
  });

  it("names the missing key when there is no cache to fall back on", async () => {
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: {}
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("missing_api_key");
    expect(result.exitCode).toBe(2);
  });

  it("refuses to silently skip a text the cache does not cover", async () => {
    // A cache built for a different corpus: the run must fail loudly rather
    // than rank against whatever happens to be in it.
    const cache = new EmbeddingCache("test-model", DIMENSIONS);
    cache.set(embeddingKey("something else entirely"), [1, 0, 0, 0]);
    writeFileSync(cacheFile, serializeEmbeddingCache(cache.toFile({ prune: false })), "utf8");

    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: { cachePath: cacheFile }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("embedding_failed");
    expect(result.message).toMatch(/not in the embedding cache/);
  });

  it("rejects a cache file that carries no model header", async () => {
    writeFileSync(cacheFile, JSON.stringify({ nope: true }), "utf8");
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: { cachePath: cacheFile }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not an embedding cache/);
  });

  it("refuses to embed a corpus the operator has not accepted sending (REQ-CORE-023 AC3)", async () => {
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: { apiKey: "sk-test-not-used" }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("corpus_transmission_not_accepted");
    expect(result.exitCode).toBe(2);
    // The count is the ask, stated before it happens rather than after.
    expect(result.message).toContain(`${SYMBOLS.length + QUERIES.length} text(s)`);
    expect(result.message).toContain("--accept-corpus-transmission");
  });

  it("gates hybrid on the same terms — the lexical half does not excuse the embedding half", async () => {
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "hybrid",
      topK: 2,
      embedding: { apiKey: "sk-test-not-used" }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("corpus_transmission_not_accepted");
  });

  it("does not gate a keyed run whose corpus is already cached, since it sends nothing", async () => {
    // Written under the model a keyed run actually resolves to, since a cache
    // headed by another model is discarded rather than merged — and a run with
    // nothing usable cached would, correctly, be gated.
    writeFullCache(cacheFile, "text-embedding-3-small", 1536);
    // A key is present, so this run *could* transmit — but every vector is
    // cached, so it will not, and the gate asks only about what would leave.
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "semantic",
      topK: 2,
      embedding: { apiKey: "sk-test-not-used", cachePath: cacheFile }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.embeddings?.embedded).toBe(0);
  });

  it("never gates lexical, which has no model to transmit to", async () => {
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "lexical",
      topK: 2,
      embedding: { apiKey: "sk-test-not-used" }
    });
    expect(result.ok).toBe(true);
  });

  it("lexical needs neither key nor cache", async () => {
    const result = await runRetrieval({
      queries: QUERIES,
      symbols: SYMBOLS,
      repositoryCommit: COMMIT,
      mode: "lexical",
      topK: 2
    });
    expect(result.ok).toBe(true);
  });
});
