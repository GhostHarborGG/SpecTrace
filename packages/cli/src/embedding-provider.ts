/**
 * OpenAI embedding adapter for Configuration B (REQ-CORE-021).
 *
 * This lives in the CLI, not in core, and that placement is the point: the
 * engine reads no environment variables and constructs no API client
 * (CLAUDE.md rule 2), so it declares an `EmbeddingProvider` interface and
 * lets a client satisfy it. Everything vendor-shaped — the endpoint, the key,
 * the request body, the retry policy — is here. Studio will supply its own
 * implementation of the same interface without touching core either.
 *
 * Model decided 2026-08-03 (BP): OpenAI `text-embedding-3`. The concrete
 * variant is configuration (`model.embedding`), defaulting to
 * `text-embedding-3-small`.
 */

import type { EmbeddingProvider } from "@spectrace/core";

const EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";

/** Native output width per model; `dimensions` can shorten but not widen these. */
const NATIVE_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536
};

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  /** Defaults to `text-embedding-3-small`. */
  model?: string;
  /** Shortened output width; must not exceed the model's native size. */
  dimensions?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Attempts per batch on a retryable failure. Default 4. */
  maxAttempts?: number;
  /** Base backoff in milliseconds, doubled per attempt. Default 500. */
  retryBaseMs?: number;
}

export class EmbeddingRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "EmbeddingRequestError";
  }
}

interface EmbeddingResponse {
  data?: { index?: number; embedding?: number[] }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 429 and 5xx are transient; 4xx otherwise means the request itself is wrong and will not improve. */
const isRetryableStatus = (status: number) => status === 429 || status >= 500;

export function createOpenAIEmbeddingProvider(options: OpenAIEmbeddingOptions): EmbeddingProvider {
  const model = options.model ?? DEFAULT_EMBEDDING_MODEL;
  const native = NATIVE_DIMENSIONS[model];

  if (options.dimensions !== undefined && native !== undefined && options.dimensions > native) {
    throw new EmbeddingRequestError(
      `${model} produces ${native}-dimension vectors; --embedding-dimensions ${options.dimensions} would widen, not shorten, them.`
    );
  }
  const dimensions = options.dimensions ?? native;
  if (dimensions === undefined) {
    throw new EmbeddingRequestError(
      `Unknown embedding model "${model}"; pass --embedding-dimensions to declare its output width.`
    );
  }

  const doFetch = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 4;
  const retryBaseMs = options.retryBaseMs ?? 500;

  return {
    modelId: options.dimensions === undefined ? model : `${model}@${dimensions}`,
    dimensions,
    async embed(texts: readonly string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      let lastError: EmbeddingRequestError | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await doFetch(EMBEDDINGS_ENDPOINT, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`
            },
            body: JSON.stringify({
              model,
              input: texts,
              // Only sent when explicitly narrowed — omitting it keeps the
              // model's native width and keeps the request body minimal.
              ...(options.dimensions === undefined ? {} : { dimensions })
            })
          });
        } catch (cause) {
          // A transport failure is retryable; a persistent one surfaces below.
          lastError = new EmbeddingRequestError(
            `Embedding request failed: ${cause instanceof Error ? cause.message : String(cause)}`
          );
          if (attempt === maxAttempts) break;
          await sleep(retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          lastError = new EmbeddingRequestError(
            `Embedding request failed with ${response.status}${body ? `: ${body.slice(0, 400)}` : ""}`,
            response.status
          );
          if (!isRetryableStatus(response.status) || attempt === maxAttempts) break;
          await sleep(retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        const payload = (await response.json()) as EmbeddingResponse;
        const data = payload.data;
        if (!Array.isArray(data) || data.length !== texts.length) {
          throw new EmbeddingRequestError(
            `Embedding response carried ${Array.isArray(data) ? data.length : 0} vector(s) for ${texts.length} input(s).`
          );
        }

        // The API documents an `index` on each item; sort by it rather than
        // trusting array order, since core matches vectors to inputs by
        // position and a reordered response would silently mislabel them.
        const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        return ordered.map((item, i) => {
          if (!Array.isArray(item.embedding)) {
            throw new EmbeddingRequestError(`Embedding response item ${i} carried no vector.`);
          }
          return item.embedding;
        });
      }

      throw lastError ?? new EmbeddingRequestError("Embedding request failed for an unknown reason.");
    }
  };
}
