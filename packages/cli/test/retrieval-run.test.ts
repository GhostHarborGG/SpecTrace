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
function writeFullCache(file: string): void {
  const cache = new EmbeddingCache("test-model", DIMENSIONS);
  const texts = [...SYMBOLS.map(symbolEmbeddingText), ...QUERIES.map((q) => q.text)];
  texts.forEach((text, i) => {
    const vector = Array.from({ length: DIMENSIONS }, (_, d) => (d === i % DIMENSIONS ? 1 : 0));
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
