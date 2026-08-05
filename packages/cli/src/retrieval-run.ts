/**
 * One retrieval run in any of the three configurations (REQ-CORE-020…022).
 *
 * Extracted so `analyze` and `evaluate sweep` cannot drift apart: a sweep
 * that ran retrieval even slightly differently from the command a user
 * invokes by hand would produce numbers that do not describe the shipped
 * tool. There is one dispatch, and both commands call it.
 *
 * Returns a discriminated result rather than exiting, because deciding what
 * a failure means — a usage error for one command, a skipped configuration
 * for another — belongs to the command, not to the run.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { dirname } from "node:path";
import {
  DEFAULT_MERGE_STRATEGY,
  EmbeddingCache,
  embeddingKey,
  mergeCandidateSets,
  mergePoolSize,
  requiresCorpusTransmissionConsent,
  retrieveCandidates,
  retrieveSemanticCandidates,
  serializeEmbeddingCache,
  symbolEmbeddingText,
  type CandidateSet,
  type CodeSymbol,
  type MergeConfig,
  type RetrievalMode
} from "@spectrace/core";
import { createOpenAIEmbeddingProvider } from "./embedding-provider.js";
import type { EmbeddingProvider } from "@spectrace/core";

/**
 * A provider that serves only what a cache already holds and refuses to
 * embed anything new.
 *
 * Model identity and vector width come from the cache header — the same two
 * facts that make the stored vectors interpretable at all — so a cached run
 * needs no key, no network, and no model configuration. That is what lets a
 * recorded evaluation be reproduced offline, and it is what makes
 * REQ-CORE-021 AC1 observable rather than merely asserted: if the second run
 * really performs zero API calls, it should not need credentials either.
 */
function createCacheOnlyProvider(cachePath: string): EmbeddingProvider {
  let header: { modelId?: unknown; dimensions?: unknown };
  try {
    header = JSON.parse(readFileSync(cachePath, "utf8")) as typeof header;
  } catch (cause) {
    throw new Error(
      `Cannot read the embedding cache at ${cachePath}: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  if (typeof header.modelId !== "string" || typeof header.dimensions !== "number") {
    throw new Error(`${cachePath} is not an embedding cache (no modelId/dimensions header).`);
  }

  return {
    modelId: header.modelId,
    dimensions: header.dimensions,
    embed(texts) {
      return Promise.reject(
        new Error(
          `${texts.length} text(s) are not in the embedding cache. Set OPENAI_API_KEY to embed them, ` +
            `or point --embedding-cache at a cache built from this exact corpus.`
        )
      );
    }
  };
}

export interface EmbeddingRunOptions {
  /** Absent means Configurations B and C cannot run; A is unaffected. */
  apiKey?: string | undefined;
  model?: string | undefined;
  dimensions?: number | undefined;
  /** Absolute path; read before the run and rewritten after it (REQ-CORE-021). */
  cachePath?: string | undefined;
}

export interface RetrievalRunOptions {
  queries: readonly { requirementId: string; text: string }[];
  symbols: readonly CodeSymbol[];
  repositoryCommit: string;
  mode: RetrievalMode;
  topK: number;
  merge?: MergeConfig;
  embedding?: EmbeddingRunOptions;
  /**
   * The operator has accepted that this configuration sends every indexed
   * symbol to a third party (REQ-CORE-023 AC3). Absent, a run that would
   * transmit is refused rather than performed.
   */
  acceptCorpusTransmission?: boolean;
}

/**
 * How many distinct texts this run would have to send, given what the cache
 * already holds.
 *
 * Deduplicated by embedding key, matching what `retrieveSemanticCandidates`
 * will actually do, so the number quoted to the operator is the number that
 * would leave — not an upper bound that overstates the ask and trains them to
 * wave it through.
 */
function countUncachedTexts(options: RetrievalRunOptions, cache: EmbeddingCache | undefined): number {
  const pending = new Set<string>();
  const texts = [...options.symbols.map(symbolEmbeddingText), ...options.queries.map((q) => q.text)];
  for (const text of texts) {
    const key = embeddingKey(text);
    if (cache?.get(key) === undefined) pending.add(key);
  }
  return pending.size;
}

/**
 * What the run sent to an embedding model. Carries the model identity and the
 * corpus-wide text counts, not just the tallies, because this is what a
 * transmitted-content log is assembled from (REQ-CORE-023, NFR-CORE-005) — a
 * disclosure that said "embedded 412 texts" without naming the model or the
 * scope would not let a reader tell what actually left the machine.
 */
export interface EmbeddingRunReport {
  modelId: string;
  dimensions: number;
  /** One per indexed symbol: semantic and hybrid retrieval embed the whole corpus. */
  symbolTexts: number;
  queryTexts: number;
  /** Texts sent to the provider over the network this run. */
  embedded: number;
  /** Texts served from the local cache, so not transmitted this run. */
  cached: number;
  cachePath?: string;
}

export type RetrievalRunResult =
  | {
      ok: true;
      results: CandidateSet[];
      configurationId: string;
      embeddings?: EmbeddingRunReport;
    }
  | { ok: false; error: string; message: string; exitCode: number };

export async function runRetrieval(options: RetrievalRunOptions): Promise<RetrievalRunResult> {
  const merge: MergeConfig = options.merge ?? { strategy: DEFAULT_MERGE_STRATEGY };
  // Hybrid retrieves a wider pool per configuration and merges down to topK;
  // a merge of two already-truncated lists has little disagreement to exploit.
  const retrievalK = options.mode === "hybrid" ? mergePoolSize(options.topK) : options.topK;

  const runLexical = (): CandidateSet[] =>
    retrieveCandidates({
      queries: options.queries,
      symbols: options.symbols,
      topK: retrievalK,
      repositoryCommit: options.repositoryCommit
    });

  if (options.mode === "lexical") {
    const results = runLexical();
    return {
      ok: true,
      results,
      configurationId: results[0]?.configurationId ?? "bm25f"
    };
  }

  const embedding = options.embedding ?? {};
  const cacheOnly = !embedding.apiKey;

  if (cacheOnly && !(embedding.cachePath && existsSync(embedding.cachePath))) {
    return {
      ok: false,
      error: "missing_api_key",
      message: `Set OPENAI_API_KEY to run retrieval mode "${options.mode}", or pass --embedding-cache pointing at a cache that already covers this corpus (REQ-CORE-021).`,
      exitCode: 2
    };
  }

  let provider;
  try {
    provider = cacheOnly
      ? // A run whose every vector is already cached performs zero API calls
        // by definition (REQ-CORE-021 AC1), so demanding a key for it would
        // contradict the requirement and block offline reproduction of a
        // recorded run. The model identity comes from the cache header, which
        // is the only thing that makes those vectors interpretable.
        createCacheOnlyProvider(embedding.cachePath!)
      : createOpenAIEmbeddingProvider({
          apiKey: embedding.apiKey!,
          ...(embedding.model ? { model: embedding.model } : {}),
          ...(embedding.dimensions === undefined ? {} : { dimensions: embedding.dimensions })
        });
  } catch (error) {
    return {
      ok: false,
      error: "invalid_embedding_config",
      message: error instanceof Error ? error.message : String(error),
      exitCode: 2
    };
  }

  let cache: EmbeddingCache | undefined;
  if (embedding.cachePath && existsSync(embedding.cachePath)) {
    try {
      cache = EmbeddingCache.parse(
        readFileSync(embedding.cachePath, "utf8"),
        provider.modelId,
        provider.dimensions
      );
    } catch {
      // A corrupt cache costs API calls, not correctness — rebuild it.
      cache = undefined;
    }
  }

  // The consent gate (REQ-CORE-023 AC3). Only a network-capable run can reach
  // it: the cache-only provider cannot transmit at all, so gating it would ask
  // for permission to do nothing and would break offline reproduction of a
  // recorded run. A run whose every vector is cached is likewise not gated —
  // consent is about content leaving the machine, not about configuration.
  const pendingTextCount = cacheOnly ? 0 : countUncachedTexts(options, cache);
  if (
    requiresCorpusTransmissionConsent({
      mode: options.mode,
      pendingTextCount,
      acknowledged: options.acceptCorpusTransmission === true
    })
  ) {
    return {
      ok: false,
      error: "corpus_transmission_not_accepted",
      message:
        `Retrieval mode "${options.mode}" embeds every indexed symbol, not just the top-k candidates: ` +
        `this run would send ${pendingTextCount} text(s) — ${options.symbols.length} symbol(s) and ` +
        `${options.queries.length} requirement(s), minus what the cache already holds — to ${provider.modelId}. ` +
        `That is repository content outside the candidate set (REQ-CORE-023). Pass ` +
        `--accept-corpus-transmission to proceed, use --embedding-cache with a cache covering this corpus ` +
        `to send nothing, or stay on the default lexical mode, which transmits nothing.`,
      exitCode: 2
    };
  }

  let semantic;
  try {
    semantic = await retrieveSemanticCandidates({
      queries: options.queries,
      symbols: options.symbols,
      topK: retrievalK,
      repositoryCommit: options.repositoryCommit,
      provider,
      ...(cache ? { cache } : {})
    });
  } catch (error) {
    return {
      ok: false,
      error: "embedding_failed",
      message: error instanceof Error ? error.message : String(error),
      exitCode: 1
    };
  }

  const embeddings: EmbeddingRunReport = {
    modelId: provider.modelId,
    dimensions: provider.dimensions,
    symbolTexts: options.symbols.length,
    queryTexts: options.queries.length,
    embedded: semantic.embeddedCount,
    cached: semantic.cachedCount
  };
  if (embedding.cachePath) {
    mkdirSync(dirname(embedding.cachePath), { recursive: true });
    writeFileSync(embedding.cachePath, serializeEmbeddingCache(semantic.cache.toFile()), "utf8");
    embeddings.cachePath = embedding.cachePath;
  }

  if (options.mode === "semantic") {
    return {
      ok: true,
      results: semantic.results,
      configurationId: semantic.results[0]?.configurationId ?? "embed",
      embeddings
    };
  }

  const results = mergeCandidateSets({
    lexical: runLexical(),
    semantic: semantic.results,
    topK: options.topK,
    config: merge
  });
  return {
    ok: true,
    results,
    configurationId: results[0]?.configurationId ?? "hybrid",
    embeddings
  };
}
