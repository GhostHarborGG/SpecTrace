/**
 * Semantic retrieval — Configuration B (REQ-CORE-021).
 *
 * Same shape as Configuration A: requirement-derived query text and the
 * symbol set from the index go in, ranked candidate lists come out. The only
 * new ingredient is an {@link EmbeddingProvider}, which the caller injects —
 * the engine reads no environment variables and constructs no API client
 * (CLAUDE.md rule 2), so the key, the base URL, and the retry policy are all
 * the client's business. That injection is also what makes the cache
 * requirement testable without a network: a provider that counts its own
 * calls proves AC1 directly.
 *
 * Embedding model decided 2026-08-03 (BP): OpenAI `text-embedding-3`. That is
 * a configuration value, not a compile-time one — nothing in this module
 * names a vendor.
 *
 * Vectors are L2-normalized on the way in, so cosine similarity is a dot
 * product and ranking never re-derives magnitudes.
 */

import type { CodeSymbol } from "../indexer/types.js";
import { EmbeddingCache, embeddingKey } from "./embedding-cache.js";
import type { CandidateSet, RetrievalQuery } from "./retrieve.js";

/**
 * Embeds text. Implemented by the client (the CLI's OpenAI adapter, Studio's
 * IPC bridge, a test double), never by the engine.
 */
export interface EmbeddingProvider {
  /** Recorded in provenance and in the cache header; vectors from different models never mix. */
  readonly modelId: string;
  readonly dimensions: number;
  /** Returns one vector per input, in input order. May be called with any batch size. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface SemanticRetrieveOptions {
  queries: readonly RetrievalQuery[];
  symbols: readonly CodeSymbol[];
  topK: number;
  repositoryCommit: string;
  provider: EmbeddingProvider;
  /** Reused across runs; supply a rehydrated cache to satisfy AC1. Created empty if omitted. */
  cache?: EmbeddingCache;
  /** Texts per embedding request. Default 64. */
  batchSize?: number;
  /** Progress callback — the engine writes no console output (CLAUDE.md rule 2). */
  onProgress?: (embedded: number, total: number) => void;
}

export interface SemanticRetrieveResult {
  results: CandidateSet[];
  cache: EmbeddingCache;
  /** Texts embedded this run. Zero on a second run at the same commit (AC1). */
  embeddedCount: number;
  /** Texts served from cache. */
  cachedCount: number;
}

export const DEFAULT_EMBEDDING_BATCH_SIZE = 64;

/** Configuration identifier recorded on results (REQ-CORE-063); bump when the composition below changes. */
export const SEMANTIC_CONFIGURATION_VERSION = "embed-v1";

export function semanticConfigurationId(modelId: string): string {
  return `${SEMANTIC_CONFIGURATION_VERSION}:${modelId}`;
}

/**
 * The text embedded for a symbol.
 *
 * Deliberately the same fields BM25F draws on (`bm25.ts`), in a fixed order,
 * so Configurations A and B are compared on the same information and any
 * difference in recall is attributable to the retrieval method rather than to
 * one configuration having been fed more. Labeled rather than concatenated
 * bare: embedding models read the labels as structure, and an unlabeled blob
 * of a signature followed by a path reads as neither.
 */
export function symbolEmbeddingText(symbol: CodeSymbol): string {
  return [
    `${symbol.kind} ${symbol.qualifiedName}`,
    `path: ${symbol.relativePath}`,
    symbol.signature ? `signature: ${symbol.signature}` : "",
    symbol.documentation ? `documentation: ${symbol.documentation}` : "",
    symbol.normalizedSource ? `source: ${symbol.normalizedSource}` : ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function l2Normalize(vector: readonly number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const magnitude = Math.sqrt(sumOfSquares);
  // A zero vector has no direction; leaving it as zeros makes every similarity
  // 0, which is the honest answer, rather than producing NaN.
  if (magnitude === 0) return [...vector];
  return vector.map((value) => value / magnitude);
}

function dot(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i]! * b[i]!;
  return total;
}

/**
 * Ranks symbols for every query by embedding similarity (REQ-CORE-021).
 *
 * Every distinct text — queries and symbols alike — is looked up in the cache
 * first and embedded only on a miss, so a second run at the same commit with
 * the same requirements issues no requests at all (AC1). Deterministic for
 * fixed inputs and a deterministic provider (NFR-CORE-002): ties break on
 * symbol ID so equal scores never depend on iteration order.
 */
export async function retrieveSemanticCandidates(
  options: SemanticRetrieveOptions
): Promise<SemanticRetrieveResult> {
  const { provider } = options;
  const cache = options.cache ?? new EmbeddingCache(provider.modelId, provider.dimensions);
  // Pruning is scoped to this run, not to the cache object's lifetime.
  cache.beginRun();
  const batchSize = options.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;

  const symbolTexts = options.symbols.map(symbolEmbeddingText);
  const queryTexts = options.queries.map((query) => query.text);

  // One pass over every text this run needs, deduplicated by key: identical
  // text is embedded once no matter how many symbols or queries carry it.
  const needed = new Map<string, string>();
  let cachedCount = 0;
  for (const text of [...symbolTexts, ...queryTexts]) {
    const key = embeddingKey(text);
    if (cache.get(key) !== undefined) {
      cachedCount += 1;
      continue;
    }
    if (!needed.has(key)) needed.set(key, text);
  }

  const pending = [...needed.entries()];
  let embeddedCount = 0;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const vectors = await provider.embed(batch.map(([, text]) => text));
    if (vectors.length !== batch.length) {
      throw new Error(
        `Embedding provider returned ${vectors.length} vector(s) for ${batch.length} input(s).`
      );
    }
    batch.forEach(([key], i) => {
      const vector = vectors[i]!;
      if (vector.length !== provider.dimensions) {
        throw new Error(
          `Embedding provider returned a ${vector.length}-dimension vector; ${provider.modelId} declares ${provider.dimensions}.`
        );
      }
      cache.set(key, l2Normalize(vector));
    });
    embeddedCount += batch.length;
    options.onProgress?.(embeddedCount, pending.length);
  }

  const configurationId = semanticConfigurationId(provider.modelId);
  const symbolVectors = options.symbols.map((symbol, i) => ({
    symbolId: symbol.symbolId,
    vector: cache.get(embeddingKey(symbolTexts[i]!))!
  }));

  const results = options.queries.map((query, i) => {
    const queryVector = cache.get(embeddingKey(queryTexts[i]!))!;
    const scored = symbolVectors
      .map((entry) => ({ symbolId: entry.symbolId, score: dot(queryVector, entry.vector) }))
      .sort((a, b) => b.score - a.score || a.symbolId.localeCompare(b.symbolId))
      .slice(0, options.topK);

    return {
      requirementId: query.requirementId,
      configurationId,
      repositoryCommit: options.repositoryCommit,
      candidates: scored.map((entry, rank) => ({
        rank: rank + 1,
        symbolId: entry.symbolId,
        score: entry.score
      }))
    };
  });

  return { results, cache, embeddedCount, cachedCount };
}
