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
  mergeCandidateSets,
  mergePoolSize,
  retrieveCandidates,
  retrieveSemanticCandidates,
  serializeEmbeddingCache,
  type CandidateSet,
  type CodeSymbol,
  type MergeConfig,
  type RetrievalMode
} from "@spectrace/core";
import { createOpenAIEmbeddingProvider } from "./embedding-provider.js";

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
}

export interface EmbeddingRunReport {
  embedded: number;
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
  if (!embedding.apiKey) {
    return {
      ok: false,
      error: "missing_api_key",
      message: `Set OPENAI_API_KEY to run retrieval mode "${options.mode}" (REQ-CORE-021).`,
      exitCode: 2
    };
  }

  let provider;
  try {
    provider = createOpenAIEmbeddingProvider({
      apiKey: embedding.apiKey,
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
