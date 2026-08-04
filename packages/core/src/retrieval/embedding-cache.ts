/**
 * Embedding cache (REQ-CORE-021) — the reason a second run at the same commit
 * makes zero embedding API calls.
 *
 * Entries are keyed by a hash of the **text that was embedded**, not by symbol
 * ID. That choice does three things at once:
 *
 * - Invalidation per symbol on content change comes for free. A symbol keeps
 *   its ID across edits to its body (REQ-CORE-010), so a symbol-keyed cache
 *   would happily serve a vector for text that no longer exists; a
 *   text-keyed one cannot.
 * - Identical text embeds once. Aggregate symbols and their members overlap
 *   heavily, and a repository with duplicated boilerplate pays for it once.
 * - Renaming a file does not invalidate anything the model would have
 *   embedded identically — except where the path is part of the embedded
 *   text, in which case it correctly does.
 *
 * The model identifier is part of the cache header rather than the key,
 * because vectors from different models are not comparable at all: a cache
 * written by one model is discarded wholesale when the configured model
 * changes, not merged.
 *
 * Pure data and pure transforms; persistence is the caller's. No timestamps,
 * so identical runs serialize identically.
 */

import { createHash } from "node:crypto";

export const EMBEDDING_CACHE_ARTIFACT = "spectrace.embedding-cache";
export const EMBEDDING_CACHE_VERSION = 1;

export interface EmbeddingCacheFile {
  artifact: typeof EMBEDDING_CACHE_ARTIFACT;
  version: number;
  modelId: string;
  dimensions: number;
  /** Sorted by key, so a cache with the same content always serializes identically. */
  entries: { key: string; vector: number[] }[];
}

export class EmbeddingCacheFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingCacheFormatError";
  }
}

/** Stable key for a piece of text under a given model. */
export function embeddingKey(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

/**
 * An in-memory cache of embedding vectors for one model.
 *
 * Tracks which keys the current run touched — see {@link EmbeddingCache.beginRun} —
 * so {@link EmbeddingCache.toFile} can drop the rest: the cache mirrors an
 * index that is itself rebuildable, so letting it accumulate vectors for
 * symbols that no longer exist would trade unbounded disk for nothing. Pass
 * `{ prune: false }` to serialize everything held instead.
 */
export class EmbeddingCache {
  private readonly vectors = new Map<string, number[]>();
  private readonly touched = new Set<string>();

  constructor(readonly modelId: string, readonly dimensions: number) {}

  /**
   * Rehydrates a cache from a parsed file. A file written by a different
   * model — or a different cache format — yields an empty cache rather than
   * an error: a stale cache is a thing to discard, not to migrate.
   */
  static fromFile(file: unknown, modelId: string, dimensions: number): EmbeddingCache {
    const cache = new EmbeddingCache(modelId, dimensions);
    if (typeof file !== "object" || file === null) return cache;
    const parsed = file as Partial<EmbeddingCacheFile>;
    if (parsed.artifact !== EMBEDDING_CACHE_ARTIFACT) return cache;
    if (parsed.version !== EMBEDDING_CACHE_VERSION) return cache;
    if (parsed.modelId !== modelId || parsed.dimensions !== dimensions) return cache;
    if (!Array.isArray(parsed.entries)) return cache;

    for (const entry of parsed.entries) {
      if (
        typeof entry?.key === "string" &&
        Array.isArray(entry.vector) &&
        entry.vector.length === dimensions &&
        entry.vector.every((v) => typeof v === "number" && Number.isFinite(v))
      ) {
        cache.vectors.set(entry.key, entry.vector);
      }
    }
    return cache;
  }

  static parse(text: string, modelId: string, dimensions: number): EmbeddingCache {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new EmbeddingCacheFormatError(`Embedding cache is not valid JSON: ${reason}`);
    }
    return EmbeddingCache.fromFile(parsed, modelId, dimensions);
  }

  /**
   * Marks the start of a run: everything cached so far is retained but
   * counts as untouched until it is read again.
   *
   * Without this, "touched" would mean "touched at any point in this
   * process's life", so a cache reused across two retrievals would serialize
   * the union of both — which is precisely the unbounded growth pruning
   * exists to prevent. {@link retrieveSemanticCandidates} calls it; callers
   * driving the cache directly should too.
   */
  beginRun(): void {
    this.touched.clear();
  }

  get size(): number {
    return this.vectors.size;
  }

  has(key: string): boolean {
    return this.vectors.has(key);
  }

  /** Returns the cached vector and marks the key as still in use. */
  get(key: string): number[] | undefined {
    const vector = this.vectors.get(key);
    if (vector !== undefined) this.touched.add(key);
    return vector;
  }

  set(key: string, vector: number[]): void {
    this.vectors.set(key, vector);
    this.touched.add(key);
  }

  toFile(options: { prune?: boolean } = {}): EmbeddingCacheFile {
    const prune = options.prune ?? true;
    const keys = [...this.vectors.keys()].filter((key) => !prune || this.touched.has(key)).sort();
    return {
      artifact: EMBEDDING_CACHE_ARTIFACT,
      version: EMBEDDING_CACHE_VERSION,
      modelId: this.modelId,
      dimensions: this.dimensions,
      entries: keys.map((key) => ({ key, vector: this.vectors.get(key)! }))
    };
  }
}

export function serializeEmbeddingCache(file: EmbeddingCacheFile): string {
  return `${JSON.stringify(file)}\n`;
}
